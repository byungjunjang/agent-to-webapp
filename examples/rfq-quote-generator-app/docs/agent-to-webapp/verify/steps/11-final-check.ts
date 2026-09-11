// 단계 11: 최종 검증 (코드). 루트·수치·xlsx·이메일 필수 문자열을 확인한다.
import ExcelJS from 'exceljs';
import { fmtMoney } from '../lib/util.ts';
import { validateCalc } from './07-calculate-quote.ts';
import { SHEET_NAME } from './10-generate-xlsx.ts';
import type { Check, ChecklistDefined, EmailMissing, Emails, ExtractedSpecs, MissingSpec, Mode, QuoteBasisField, QuoteCalculation, RouteResult, XlsxFile } from '../lib/types.ts';

export interface FinalCheckInput {
  specs: ExtractedSpecs;
  missing_specs: MissingSpec[];
  checklist_defined: ChecklistDefined[];
  mode: Mode;
  provisional_fields: QuoteBasisField[];
  routes: RouteResult[];
  calc: QuoteCalculation;
  emails: Emails;
  xlsx: XlsxFile | null;
}

export interface FinalCheckOutput {
  ok: boolean;
  checks: Check[];
  email_missing: EmailMissing;
}

const STATUSES = ['recommended', 'valid', 'candidate_not_recommended', 'not_suitable'];
const LANGS = ['ko', 'zh', 'en'] as const;
const PROVISIONAL_WORD = { ko: '잠정', zh: '暂定', en: 'provisional' };
const NO_ROUTE_WORD = { ko: '대응 불가', zh: '无法', en: 'unable' };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
  return String(v);
}

function cellNumber(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

async function checkXlsx(xlsx: XlsxFile, calc: QuoteCalculation): Promise<Check[]> {
  const checks: Check[] = [];
  const headline = calc.quotes[0];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(xlsx.data_base64, 'base64') as never);
  const ws = wb.getWorksheet(SHEET_NAME);
  if (!ws) return [{ name: 'xlsx.sheet', level: 'error', ok: false, detail: `시트 '${SHEET_NAME}' 가 없다` }];

  let totalLine: string | null = null;
  let itemHeaderRow: number | null = null;
  ws.eachRow((row, n) => {
    const a = cellText(row.getCell(1).value);
    if (a.startsWith('합계금액:')) totalLine = a;
    if (a === 'No.' && itemHeaderRow === null) itemHeaderRow = n;
  });
  const want = fmtMoney(headline.total_quote_cny);
  checks.push({
    name: 'xlsx.total',
    level: 'error',
    ok: totalLine !== null && (totalLine as string).includes(want),
    detail: totalLine === null ? '합계금액 줄이 없다' : `합계금액 줄 "${totalLine}" 에 ${want} 포함 여부`,
  });

  if (itemHeaderRow === null) {
    checks.push({ name: 'xlsx.items', level: 'error', ok: false, detail: '품목 헤더 행이 없다' });
    return checks;
  }
  const problems: string[] = [];
  for (let i = 0; i < calc.quotes.length; i++) {
    const row = ws.getRow((itemHeaderRow as number) + 1 + i);
    const unit = cellNumber(row.getCell(6).value);
    const supply = cellNumber(row.getCell(7).value);
    const q = calc.quotes[i];
    if (unit !== q.quote_per_pc_cny) problems.push(`${q.route_name} 단가 ${unit} ≠ ${q.quote_per_pc_cny}`);
    if (supply !== q.total_quote_cny) problems.push(`${q.route_name} 공급가액 ${supply} ≠ ${q.total_quote_cny}`);
  }
  checks.push({ name: 'xlsx.items', level: 'error', ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `${calc.quotes.length}행 일치` });
  return checks;
}

function moneyVariants(n: number): string[] {
  return [...new Set([n.toFixed(2), fmtMoney(n)])];
}

/** 이메일 세 통에 필수 문자열이 있는지. 빠진 것을 언어별로 돌려준다. */
export function requiredEmailStrings(input: FinalCheckInput): Record<typeof LANGS[number], string[][]> {
  const { specs, calc, mode, xlsx } = input;
  const headline = calc.quotes[0] ?? null;
  const out = { ko: [] as string[][], zh: [] as string[][], en: [] as string[][] };
  for (const lang of LANGS) {
    const req: string[][] = []; // 각 항목은 "이 가운데 하나" 후보 목록
    if (specs.rfq_number) req.push([specs.rfq_number]);
    req.push([specs.drawing_no]);
    if (headline) {
      req.push(moneyVariants(headline.quote_per_pc_cny));
      req.push(moneyVariants(headline.total_quote_cny));
    }
    if (calc.outcome === 'quote' && xlsx) req.push([xlsx.filename]);
    if (mode === 'provisional') req.push([PROVISIONAL_WORD[lang]]);
    if (calc.outcome === 'no_route') req.push([NO_ROUTE_WORD[lang]]);
    out[lang] = req;
  }
  return out;
}

function numberSet(text: string): Set<string> {
  const m = text.match(/\d[\d,]*\.\d{2}(?!\d)/g) ?? [];
  return new Set(m.map((s) => s.replace(/,/g, '')));
}

export async function finalCheck(input: FinalCheckInput): Promise<FinalCheckOutput> {
  const checks: Check[] = [];
  const { routes, calc, emails } = input;

  // 루트 3개, status enum, reason·recommendation_comment
  checks.push({ name: 'routes.count', level: 'error', ok: routes.length === 3, detail: `${routes.length}개` });
  const badStatus = routes.filter((r) => !STATUSES.includes(r.status)).map((r) => `${r.route_name}=${r.status}`);
  checks.push({ name: 'routes.status', level: 'error', ok: badStatus.length === 0, detail: badStatus.length ? badStatus.join(', ') : null });
  const noText = routes.filter((r) => !r.reason || !r.recommendation_comment).map((r) => r.route_name);
  checks.push({ name: 'routes.explained', level: 'error', ok: noText.length === 0, detail: noText.length ? `설명 없음: ${noText.join(', ')}` : null });

  // 단계 7 수치 검증 재실행
  const calcProblems = validateCalc(calc);
  checks.push({ name: 'calc.numbers', level: 'error', ok: calcProblems.length === 0, detail: calcProblems.length ? calcProblems.join('; ') : null });

  // xlsx 재독취
  if (calc.outcome === 'quote') {
    if (!input.xlsx) checks.push({ name: 'xlsx.exists', level: 'error', ok: false, detail: 'outcome quote 인데 xlsx 가 없다' });
    else checks.push(...(await checkXlsx(input.xlsx, calc)));
  } else {
    checks.push({ name: 'xlsx.exists', level: 'error', ok: input.xlsx === null, detail: 'outcome no_route 면 xlsx 는 null' });
  }

  // 이메일 필수 문자열
  const required = requiredEmailStrings(input);
  const email_missing: EmailMissing = { ko: [], zh: [], en: [] };
  for (const lang of LANGS) {
    const text = `${emails[lang].subject}\n${emails[lang].body_md}`;
    for (const candidates of required[lang]) {
      if (!candidates.some((c) => text.includes(c))) email_missing[lang].push(candidates[0]);
    }
    checks.push({
      name: `email.${lang}.required`,
      level: 'error',
      ok: email_missing[lang].length === 0,
      detail: email_missing[lang].length ? `빠짐: ${email_missing[lang].join(', ')}` : null,
    });
  }

  // warning: 세 본문의 소수 2자리 숫자 집합
  const sets = LANGS.map((l) => numberSet(emails[l].body_md));
  const union = new Set(sets.flatMap((s) => [...s]));
  const uneven = [...union].filter((n) => !sets.every((s) => s.has(n)));
  checks.push({
    name: 'email.numbers_consistent',
    level: 'warning',
    ok: uneven.length === 0,
    detail: uneven.length ? `세 통에 고르게 없는 숫자: ${uneven.join(', ')}` : null,
  });

  const ok = checks.filter((c) => c.level === 'error').every((c) => c.ok);
  return { ok, checks, email_missing };
}
