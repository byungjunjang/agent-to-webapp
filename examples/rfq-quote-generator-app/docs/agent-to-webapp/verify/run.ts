#!/usr/bin/env node
// agent-to-webapp 4단계 재검증. workflow.md 의 순서대로 steps/ 의 함수를 부른다. 순서는 이 파일이 정한다.
//   node --env-file-if-exists=<SKILL_DIR>/.env --env-file-if-exists=.env run.ts <입력 폴더> [--out <폴더>]
//   node run.ts --selftest        (조건 ⑤: 관찰하지 못한 분기 4개를 단계 6·7 규칙 함수로 확인)
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEquipment } from './lib/equipment.ts';
import { MODEL, usageLog } from './lib/llm.ts';
import { NeedsAttention, pretty } from './lib/util.ts';
import { intake, IntakeError } from './steps/01-intake.ts';
import { extractSpecs } from './steps/02-extract-specs.ts';
import { validateSpecs } from './steps/03-validate-specs.ts';
import { autoHumanValues, confirmQuoteBasis } from './steps/04-confirm-basis.ts';
import { identifyMissingSpecs } from './steps/05-missing-specs.ts';
import { evaluateRoutes } from './steps/06-evaluate-routes.ts';
import { calculateQuote } from './steps/07-calculate-quote.ts';
import { explainRoutes } from './steps/08-explain-routes.ts';
import { writeEmails } from './steps/09-write-emails.ts';
import { generateXlsx, xlsxFilename } from './steps/10-generate-xlsx.ts';
import { finalCheck } from './steps/11-final-check.ts';
import { REVIEW_CHECKLIST, reviewBeforeSend } from './steps/12-review.ts';
import type { EmailMissing, ExtractedSpecs, FileRole, InputFile, MediaType } from './lib/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const EQUIPMENT_CSV = join(HERE, 'data', 'available_equipment.csv');

function log(msg: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

/** 재검증 스크립트는 파일명으로 role 을 정한다. 웹 앱은 업로드 칸으로 정한다. */
export function loadInputFolder(dir: string): InputFile[] {
  const files: InputFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    let role: FileRole;
    if (/^customer_rfq_email\.(pdf|md|txt)$/i.test(name)) role = 'rfq_email';
    else if (/^part_drawing_.*\.pdf$/i.test(name)) role = 'drawing';
    else throw new IntakeError([`역할을 정할 수 없는 파일: ${name} (customer_rfq_email.* 또는 part_drawing_*.pdf 만 받는다)`]);
    const ext = extname(name).toLowerCase();
    const media_type: MediaType = ext === '.pdf' ? 'application/pdf' : ext === '.md' ? 'text/markdown' : 'text/plain';
    files.push({ name, role, media_type, data_base64: readFileSync(p).toString('base64') });
  }
  return files;
}

interface StepTiming { step: string; ms: number }

async function runPipeline(inputDir: string, outDir: string): Promise<number> {
  mkdirSync(outDir, { recursive: true });
  const timings: StepTiming[] = [];
  const humanNotes: string[] = [];
  const save = (name: string, data: unknown): void => {
    writeFileSync(join(outDir, name), typeof data === 'string' ? data : pretty(data), 'utf8');
  };
  const timed = async <T>(step: string, fn: () => Promise<T> | T): Promise<T> => {
    const t = Date.now();
    const v = await fn();
    timings.push({ step, ms: Date.now() - t });
    return v;
  };
  const equipment = loadEquipment(EQUIPMENT_CSV);
  let status: 'done' | 'needs_attention' = 'done';
  let attention: string | null = null;

  try {
    // 단계 1
    const files = loadInputFolder(inputDir);
    const job = await timed('1', () => intake({ files, received_at: new Date().toISOString() }));
    log(`단계 1 접수: job ${job.job_id}, ${job.received_date}, 파일 ${files.map((f) => `${f.name}(${f.role})`).join(', ')}`);
    save('01-intake.json', { job_id: job.job_id, received_date: job.received_date, files: files.map(({ name, role, media_type }) => ({ name, role, media_type })) });

    // 단계 2 ↔ 3 (재추출 최대 2회)
    let previous_errors: string[] = [];
    let attempt = 1;
    let validated: ReturnType<typeof validateSpecs>;
    for (;;) {
      const ex = await timed(`2#${attempt}`, () => extractSpecs({ job_id: job.job_id, files: job.files, previous_errors }));
      log(`단계 2 추출 #${attempt}: rfq ${ex.specs.rfq_number ?? 'null'}, lot ${ex.specs.lot_size ?? 'null'}, delivery ${ex.specs.delivery_days ?? 'null'}, material ${ex.specs.material ?? 'null'}`);
      save(`02-specs-raw-${attempt}.json`, ex.specs);
      validated = await timed(`3#${attempt}`, () => validateSpecs({ job_id: job.job_id, received_date: job.received_date, specs: ex.specs, attempt }));
      if (validated.errors.length === 0) break;
      log(`단계 3 검증 실패 #${attempt}: ${validated.errors.join('; ')}`);
      if (attempt >= 3) throw new NeedsAttention('3', `세 번째에도 errors 가 남았다: ${validated.errors.join('; ')}`);
      previous_errors = validated.errors;
      attempt += 1;
    }
    log(`단계 3 검증: mode ${validated.mode}, provisional ${JSON.stringify(validated.provisional_fields)}, rfq ${validated.specs.rfq_number}`);
    save('03-validation.json', { errors: validated.errors, mode: validated.mode, provisional_fields: validated.provisional_fields, attempts: attempt });

    // 단계 4 (사람 → 자동 승인)
    const human = autoHumanValues(validated.specs, validated.provisional_fields);
    const confirmed = await timed('4', () => confirmQuoteBasis(
      { job_id: job.job_id, mode: validated.mode, provisional_fields: validated.provisional_fields, specs: validated.specs }, human));
    const specs: ExtractedSpecs = confirmed.specs;
    save('04-decision.json', confirmed.decision);
    if (confirmed.decision.status === 'skipped') {
      humanNotes.push('단계 4 견적 전제 확인: mode firm 이라 skipped. 사람이 볼 것 없음');
    } else {
      humanNotes.push(`단계 4 견적 전제 확인: 자동 승인. provisional_fields=${JSON.stringify(validated.provisional_fields)}, 넣은 값=${JSON.stringify(confirmed.decision.values)}. 영업 담당이 수량·납기·재질을 직접 넣었어야 한다(수량은 기본값 없이 빈 칸)`);
    }
    log(`단계 4 전제 확인: ${confirmed.decision.status}`);

    // 단계 5
    const missing = await timed('5', () => identifyMissingSpecs({ files: job.files, specs, mode: validated.mode, provisional_fields: validated.provisional_fields }));
    log(`단계 5 누락 스펙: missing ${missing.missing_specs.map((m) => m.key).join(',')} / defined ${missing.checklist_defined.map((c) => c.key).join(',')}`);
    save('05-missing.json', missing);

    // 단계 6
    const routed = await timed('6', () => evaluateRoutes({ specs, provisional_fields: validated.provisional_fields, equipment }));
    log(`단계 6 루트: ${routed.routes.map((r) => `${r.route_name}=${r.status}[${r.lead_time_assessment ?? '-'}]`).join(', ')}`);
    save('06-routes.json', routed.routes);

    // 단계 7
    const { calc } = await timed('7', () => calculateQuote({ specs, routes: routed.routes, equipment, provisional_fields: validated.provisional_fields, extra_lot_sizes: confirmed.decision.extra_lot_sizes }));
    log(`단계 7 계산: ${calc.outcome}, headline ${calc.headline_route ?? '-'}, ${calc.quotes.map((q) => `${q.route_name} ${q.cycle_time_hr}hr/${q.batches}b/${q.quote_per_pc_cny}`).join(' | ')}`);
    save('07-calc.json', calc);

    // 단계 8
    const explained = await timed('8', () => explainRoutes({ specs, missing_specs: missing.missing_specs, mode: validated.mode, routes: routed.routes, calc }));
    log('단계 8 설명: 완료');
    save('08-routes-explained.json', explained.routes);

    // 단계 10 (파일명은 단계 9 가 먼저 쓴다. 생성 자체는 이메일과 독립)
    const xlsxOut = await timed('10', () => generateXlsx({ received_date: job.received_date, specs, missing_specs: missing.missing_specs, mode: validated.mode, routes: explained.routes, calc }));
    if (xlsxOut.xlsx) {
      writeFileSync(join(outDir, xlsxOut.xlsx.filename), Buffer.from(xlsxOut.xlsx.data_base64, 'base64'));
      log(`단계 10 견적서: ${xlsxOut.xlsx.filename}`);
    } else log('단계 10 견적서: no_route 라 만들지 않음');
    save('10-xlsx-summary.json', xlsxOut.summary);

    // 단계 9 ↔ 11 (필수 문자열 누락이면 1회 재작성)
    const xlsx_filename = calc.outcome === 'quote' ? xlsxFilename(specs.rfq_number ?? 'N/A') : null;
    let retry_missing: EmailMissing = { ko: [], zh: [], en: [] };
    let emails = (await timed('9#1', () => writeEmails({ specs, missing_specs: missing.missing_specs, mode: validated.mode, routes: explained.routes, calc, xlsx_filename, retry_missing }))).emails;
    let check = await timed('11#1', () => finalCheck({ specs, missing_specs: missing.missing_specs, checklist_defined: missing.checklist_defined, mode: validated.mode, provisional_fields: validated.provisional_fields, routes: explained.routes, calc, emails, xlsx: xlsxOut.xlsx }));
    const onlyEmailMissing = !check.ok && check.checks.filter((c) => c.level === 'error' && !c.ok).every((c) => c.name.startsWith('email.') && c.name.endsWith('.required'));
    if (onlyEmailMissing) {
      log(`단계 11: 이메일 필수 문자열 누락 → 단계 9 재작성. ${JSON.stringify(check.email_missing)}`);
      retry_missing = check.email_missing;
      emails = (await timed('9#2', () => writeEmails({ specs, missing_specs: missing.missing_specs, mode: validated.mode, routes: explained.routes, calc, xlsx_filename, retry_missing }))).emails;
      check = await timed('11#2', () => finalCheck({ specs, missing_specs: missing.missing_specs, checklist_defined: missing.checklist_defined, mode: validated.mode, provisional_fields: validated.provisional_fields, routes: explained.routes, calc, emails, xlsx: xlsxOut.xlsx }));
    }
    for (const lang of ['ko', 'zh', 'en'] as const) {
      save(`reply_email_${lang}.md`, `**Subject:** ${emails[lang].subject}\n\n${emails[lang].body_md}\n`);
    }
    save('09-emails.json', emails);
    save('11-checks.json', check);
    log(`단계 11 검증: ${check.ok ? 'ok' : 'FAILED'} — ${check.checks.map((c) => `${c.name}:${c.ok ? 'ok' : 'NG'}`).join(' ')}`);
    if (!check.ok) {
      status = 'needs_attention';
      attention = `단계 11 검증 실패: ${check.checks.filter((c) => c.level === 'error' && !c.ok).map((c) => `${c.name} (${c.detail ?? ''})`).join('; ')}`;
    }

    // 단계 12 (사람 → 자동 승인)
    const reviewed = await timed('12', () => reviewBeforeSend(
      { job_id: job.job_id, specs, missing_specs: missing.missing_specs, mode: validated.mode, routes: explained.routes, calc, emails, xlsx: xlsxOut.xlsx, checks: check.checks },
      { status: 'approved', reviewed_by: 'verify script (auto)' }));
    save('12-review.json', reviewed.review);
    humanNotes.push(`단계 12 발송 전 검토: 자동 승인. 사람이 봤어야 할 것 — ${REVIEW_CHECKLIST.join(' / ')}`);

    save('summary.json', {
      input: basename(inputDir),
      status,
      attention,
      model: MODEL,
      job_id: job.job_id,
      received_date: job.received_date,
      mode: validated.mode,
      provisional_fields: validated.provisional_fields,
      rfq_number: specs.rfq_number,
      lot_size: specs.lot_size,
      delivery_days: specs.delivery_days,
      material: specs.material,
      outcome: calc.outcome,
      headline_route: calc.headline_route,
      quotes: calc.quotes.map((q) => ({ route_name: q.route_name, status: q.status, cycle_time_hr: q.cycle_time_hr, batches: q.batches, unit_cost_cny: q.unit_cost_cny, quote_per_pc_cny: q.quote_per_pc_cny, total_quote_cny: q.total_quote_cny })),
      references: {
        not_suitable_routes: calc.references.not_suitable_routes.map((q) => ({ route_name: q.route_name, cycle_time_hr: q.cycle_time_hr, batches: q.batches, quote_per_pc_cny: q.quote_per_pc_cny })),
        monthly_volume: calc.references.monthly_volume.map((q) => ({ route_name: q.route_name, lot_size: q.lot_size, batches: q.batches, quote_per_pc_cny: q.quote_per_pc_cny })),
        lot_table: calc.references.lot_table.map((q) => ({ route_name: q.route_name, lot_size: q.lot_size, batches: q.batches, quote_per_pc_cny: q.quote_per_pc_cny })),
      },
      routes: explained.routes.map((r) => ({ route_name: r.route_name, status: r.status, rule_hits: r.rule_hits, lead_time_assessment: r.lead_time_assessment, conditional_on: r.conditional_on })),
      missing_specs: missing.missing_specs.map((m) => `${m.id}. [${m.category}] ${m.key}: ${m.item_name}`),
      checklist_defined: missing.checklist_defined.map((c) => c.key),
      xlsx: xlsxOut.xlsx?.filename ?? null,
      checks: check.checks,
      human_notes: humanNotes,
      timings,
      usage: usageLog,
    });
    log(`완료: ${status}${attention ? ` — ${attention}` : ''}`);
    return status === 'done' ? 0 : 1;
  } catch (e) {
    const err = e as Error;
    const payload = e instanceof NeedsAttention ? e.payload : undefined;
    save('summary.json', { input: basename(inputDir), status: 'needs_attention', attention: err.message, payload, model: MODEL, human_notes: humanNotes, timings, usage: usageLog });
    console.error(`needs_attention: ${err.message}`);
    if (!(e instanceof NeedsAttention) && !(e instanceof IntakeError)) console.error(err.stack);
    return 1;
  }
}

/** 조건 ⑤: 관찰에서 한 번도 나오지 않은 분기 4개를 단계 6·7 규칙 함수로 확인한다. LLM 을 부르지 않는다. */
function selftest(): number {
  const equipment = loadEquipment(EQUIPMENT_CSV);
  const base: ExtractedSpecs = {
    part_name: 'EV Reducer Input Shaft', drawing_no: 'ND-IS-042', drawing_rev: 'A', material: 'SCM420H',
    lot_size: 1200, monthly_volume: null, annual_volume: null, part_weight_kg: 0.82,
    case_depth_low: 0.45, case_depth_high: 0.65, case_depth_zone: null, hardness_test_standard: 'HV550',
    surface_hardness_low: 58, surface_hardness_high: 62, core_hardness_low: 30, core_hardness_high: 42,
    distortion_limit_mm: 0.03, distortion_definition: null, grinding_after_ht: false,
    straightening_allowed: null, accepts_medium_distortion: null, automotive_quality_priority: true,
    nitriding_compatible: null, prefers_carburizing_behavior: null, delivery_days: 12, delivery_basis: null,
    packing_requirement: null, ppap_requirement: null, inspection_requirement: null, customer_name: null,
    customer_email: null, customer_company: null, rfq_number: 'TEST', rfq_date: null, rfq_subject: null,
    customer_requested_reply_items: [], sources: { material: 'rfq', lot_size: 'rfq', delivery_days: 'rfq' },
    unconfirmed_fields: [], extraction_notes: [],
  };
  const cases: { name: string; specs: ExtractedSpecs; expect: Record<string, unknown> }[] = [
    {
      name: 'ECD 상한 0.80 초과 (0.70–0.90)',
      specs: { ...base, case_depth_low: 0.70, case_depth_high: 0.90 },
      expect: { vacuum_carburizing: 'not_suitable', gas_carburizing: 'candidate_not_recommended', gas_nitriding: 'not_suitable', outcome: 'quote', headline: 'gas_carburizing' },
    },
    {
      name: '질화 valid (ECD 0.20–0.35, 질화 호환, 침탄 선호 없음)',
      specs: { ...base, case_depth_low: 0.20, case_depth_high: 0.35, nitriding_compatible: true, prefers_carburizing_behavior: false },
      expect: { vacuum_carburizing: 'recommended', gas_carburizing: 'not_suitable', gas_nitriding: 'valid', outcome: 'quote', headline: 'vacuum_carburizing' },
    },
    {
      name: 'valid 루트 0개 (재질 S45C)',
      specs: { ...base, material: 'S45C' },
      expect: { vacuum_carburizing: 'not_suitable', gas_carburizing: 'not_suitable', gas_nitriding: 'not_suitable', outcome: 'no_route', headline: null },
    },
    {
      name: '요청 납기 10일 미만 (7일)',
      specs: { ...base, delivery_days: 7 },
      expect: { vacuum_carburizing: 'recommended', gas_carburizing: 'candidate_not_recommended', gas_nitriding: 'not_suitable', lead_vc: 'not_feasible', lead_gc: 'not_feasible', lead_gn: null, outcome: 'quote', headline: 'vacuum_carburizing' },
    },
    {
      name: '기준(NovaDrive 값) — 사사오입 확인',
      specs: base,
      expect: { vacuum_carburizing: 'recommended', gas_carburizing: 'candidate_not_recommended', gas_nitriding: 'not_suitable', outcome: 'quote', headline: 'vacuum_carburizing', vc_quote: 13.92, gc_cycle: 6.6, gc_quote: 8.76, gn_ref_quote: 23.41 },
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const { routes } = evaluateRoutes({ specs: c.specs, provisional_fields: [], equipment });
    const { calc } = calculateQuote({ specs: c.specs, routes, equipment, provisional_fields: [], extra_lot_sizes: [] });
    const got: Record<string, unknown> = { outcome: calc.outcome, headline: calc.headline_route };
    for (const r of routes) got[r.route_name] = r.status;
    const lt = (n: string) => routes.find((r) => r.route_name === n)?.lead_time_assessment ?? null;
    got.lead_vc = lt('vacuum_carburizing'); got.lead_gc = lt('gas_carburizing'); got.lead_gn = lt('gas_nitriding');
    const q = (n: string) => calc.quotes.find((x) => x.route_name === n);
    got.vc_quote = q('vacuum_carburizing')?.quote_per_pc_cny ?? null;
    got.gc_cycle = q('gas_carburizing')?.cycle_time_hr ?? null;
    got.gc_quote = q('gas_carburizing')?.quote_per_pc_cny ?? null;
    got.gn_ref_quote = calc.references.not_suitable_routes.find((x) => x.route_name === 'gas_nitriding')?.quote_per_pc_cny ?? null;
    const diffs = Object.entries(c.expect).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k}: 기대 ${JSON.stringify(v)} / 실제 ${JSON.stringify(got[k])}`);
    if (diffs.length) failed += 1;
    console.log(`${diffs.length ? 'FAIL' : 'ok  '} ${c.name}`);
    console.log(`     routes: ${routes.map((r) => `${r.route_name}=${r.status}[${r.rule_hits.join(',')}] lt=${r.lead_time_assessment ?? '-'}`).join(' | ')}`);
    console.log(`     calc: ${calc.outcome}, headline ${calc.headline_route ?? '-'}, ${calc.quotes.map((x) => `${x.route_name} ${x.cycle_time_hr}hr/${x.batches}b/${x.unit_cost_cny}→${x.quote_per_pc_cny}`).join(' | ')}; not_suitable ref: ${calc.references.not_suitable_routes.map((x) => `${x.route_name} ${x.cycle_time_hr}hr/${x.batches}b/${x.quote_per_pc_cny}`).join(' | ')}`);
    for (const d of diffs) console.log(`     ✗ ${d}`);
  }
  console.log(failed ? `\nselftest: ${failed}개 실패` : '\nselftest: 모두 통과');
  return failed ? 1 : 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  const positional = args.filter((a) => !a.startsWith('--'));
  const outFlag = args.indexOf('--out');
  if (positional.length !== 1) {
    console.error('사용법: node run.ts <입력 폴더> [--out <폴더>]  |  node run.ts --selftest');
    return 2;
  }
  const inputDir = resolve(positional[0]);
  if (!existsSync(inputDir)) { console.error(`입력 폴더가 없다: ${inputDir}`); return 2; }
  const outDir = outFlag >= 0 && args[outFlag + 1] ? resolve(args[outFlag + 1]) : join(HERE, 'out', basename(inputDir));
  log(`모델 ${MODEL}, 입력 ${inputDir}, 출력 ${outDir}`);
  return runPipeline(inputDir, outDir);
}

process.exitCode = await main();
