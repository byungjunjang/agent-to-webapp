// 단계 10: 견적서 xlsx 생성 (코드). generate_quote_xlsx.py 의 영역 순서를 따르되 JSON 만 읽어 한 번에 만든다.
// 생성 뒤 셀을 고치는 단계는 없다(조건 ②).
import ExcelJS from 'exceljs';
import { fmtMoney, NeedsAttention } from '../lib/util.ts';
import type { ExtractedSpecs, MissingSpec, Mode, QuoteCalculation, QuoteRow, RouteResult, XlsxFile } from '../lib/types.ts';

export interface XlsxInput {
  received_date: string;
  specs: ExtractedSpecs;
  missing_specs: MissingSpec[];
  mode: Mode;
  routes: RouteResult[];
  calc: QuoteCalculation;
}

export interface XlsxOutput {
  xlsx: XlsxFile | null;
  summary: {
    total_quote_cny: number | null;
    item_rows: { route_name: string; quote_per_pc_cny: number; supply_amount_cny: number; remark: '추천' | '대안' | '참고' }[];
  };
}

export const SHEET_NAME = '견적서';
export const COL_WIDTHS = [6, 28, 24, 10, 8, 14, 18, 22];
export const MONEY_FMT = '#,##0.00';
const FONT_NAME = '맑은 고딕';
const SUPPLIER_LINES: [string, string][] = [
  ['상호', 'Dongwoo Dongam Technology (Wuxi)'],
  ['대표자', '(대표자명)'],
  ['연락처', '(연락처)'],
];
export const ROUGH_QUOTE_LINE = '  - 본 견적은 러프 견적(rough quote)이며, 최종 단가는 시험 가공(trial) 후 확정됩니다.';
const REMARK: Record<string, '추천' | '대안' | '참고'> = { recommended: '추천', valid: '대안', candidate_not_recommended: '참고' };
const LEAD_TIME_TEXT: Record<string, string> = {
  feasible: '대응 가능',
  risk: '일정 리스크 — 사전 협의 필요',
  not_feasible: '요청 납기 대응 불가',
};

export function xlsxFilename(rfq_number: string): string {
  return `견적서_${rfq_number.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`;
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Ws = ExcelJS.Worksheet;
type Align = 'left' | 'center' | 'right';
interface CellStyle { bold?: boolean; size?: number; align?: Align; fill?: string; border?: boolean; money?: boolean }

const THIN = { style: 'thin' as const };
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function put(ws: Ws, row: number, col: number, value: string | number, st: CellStyle = {}): void {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font = { name: FONT_NAME, size: st.size ?? 10, bold: st.bold ?? false };
  cell.alignment = { horizontal: st.align ?? 'left', vertical: 'middle', wrapText: true };
  if (st.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.fill } };
  if (st.border) cell.border = BORDER_ALL;
  if (st.money) cell.numFmt = MONEY_FMT;
}

function borderRow(ws: Ws, row: number, c1: number, c2: number): void {
  for (let c = c1; c <= c2; c++) ws.getCell(row, c).border = BORDER_ALL;
}

function merge(ws: Ws, row: number, c1: number, c2: number): void {
  ws.mergeCells(row, c1, row, c2);
}

export async function buildWorkbook(input: XlsxInput): Promise<{ buffer: Buffer; summary: XlsxOutput['summary'] }> {
  const { specs, calc, mode, missing_specs, routes, received_date } = input;
  const src = specs.sources;
  const mark = (field: string, text: string): string => (src[field] === 'sales' ? `${text} (가정)` : text);
  const rfq = specs.rfq_number ?? 'N/A';
  const rfqShown = src.rfq_number === 'internal' ? `${rfq} (당사 부여)` : rfq;
  const headline = calc.quotes[0] ?? null;
  const headlineRoute = headline ? routes.find((r) => r.route_name === headline.route_name) ?? null : null;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // 1. 제목
  let row = 1;
  merge(ws, row, 1, 8);
  put(ws, row, 1, '견  적  서', { size: 22, bold: true, align: 'center' });

  // 2. 헤더
  row = 3;
  const left: [string, string][] = [
    ['견적번호', `QT-${rfq}`],
    ['견적일자', received_date],
    ['유효기간', addDays(received_date, 30)],
    ['견적 구분', mode === 'firm' ? '러프 견적' : '잠정 견적 (가정 기준)'],
  ];
  const drawing = specs.drawing_rev ? `${specs.drawing_no} Rev.${specs.drawing_rev}` : specs.drawing_no;
  const right: [string, string][] = [
    ['수신', `${specs.customer_company ?? '(회사명 미확인)'}  ${specs.customer_name ?? '담당자'} 귀하`],
    ['RFQ No.', rfqShown],
    ['도면번호', drawing],
  ];
  left.forEach(([label, value], i) => {
    put(ws, row + i, 1, label, { bold: true, align: 'right' });
    merge(ws, row + i, 2, 3);
    put(ws, row + i, 2, value);
  });
  right.forEach(([label, value], i) => {
    put(ws, row + i, 5, label, { bold: true, align: 'right' });
    merge(ws, row + i, 6, 8);
    put(ws, row + i, 6, value);
  });
  row += Math.max(left.length, right.length) + 1;

  // 3. 공급자
  put(ws, row, 1, '공급자', { bold: true });
  SUPPLIER_LINES.forEach(([label, value], i) => {
    put(ws, row + i, 2, label, { align: 'right' });
    merge(ws, row + i, 3, 4);
    put(ws, row + i, 3, value);
  });
  row += SUPPLIER_LINES.length + 1;

  // 4. 합계금액
  merge(ws, row, 1, 8);
  put(ws, row, 1, `합계금액:  ¥ ${fmtMoney(headline!.total_quote_cny)} CNY  (부가세 별도)`, { size: 14, bold: true, align: 'center', fill: 'FFFFF2CC', border: true });
  borderRow(ws, row, 1, 8);
  row += 2;

  // 5. 품목
  const headers = ['No.', '품명', '규격 (공정)', '수량', '단위', '단가(CNY)', '공급가액(CNY)', '비고'];
  headers.forEach((h, i) => put(ws, row, i + 1, h, { bold: true, align: 'center', fill: 'FFD9E1F2', border: true }));
  const item_rows: XlsxOutput['summary']['item_rows'] = [];
  calc.quotes.forEach((q: QuoteRow, i: number) => {
    row += 1;
    const remark = REMARK[q.status] ?? '참고';
    put(ws, row, 1, i + 1, { align: 'center', border: true });
    put(ws, row, 2, specs.part_name, { border: true });
    put(ws, row, 3, q.display_name, { border: true });
    put(ws, row, 4, q.lot_size, { align: 'center', border: true });
    put(ws, row, 5, 'EA', { align: 'center', border: true });
    put(ws, row, 6, q.quote_per_pc_cny, { align: 'right', border: true, money: true });
    put(ws, row, 7, q.total_quote_cny, { align: 'right', border: true, money: true });
    put(ws, row, 8, remark, { border: true });
    item_rows.push({ route_name: q.route_name, quote_per_pc_cny: q.quote_per_pc_cny, supply_amount_cny: q.total_quote_cny, remark });
  });
  row += 1;
  merge(ws, row, 1, 5);
  put(ws, row, 1, '합    계', { bold: true, align: 'center' });
  put(ws, row, 7, headline!.total_quote_cny, { bold: true, align: 'right', money: true });
  borderRow(ws, row, 1, 8);
  row += 2;

  // 6. 상세 조건
  merge(ws, row, 1, 8);
  put(ws, row, 1, '상세 조건', { bold: true, fill: 'FFD9E1F2' });
  borderRow(ws, row, 1, 8);
  const straightening = specs.straightening_allowed === true ? '허용' : specs.straightening_allowed === false ? '불허' : '미정';
  const details: [string, string][] = [
    ['대상 부품', `${specs.part_name} / ${specs.drawing_no} / ${mark('material', specs.material ?? '(재질 미확인)')}`],
    ['유효 경화층 깊이 (ECD)', `${specs.case_depth_low}-${specs.case_depth_high} mm @ ${specs.hardness_test_standard ?? 'HV550'}`],
    ['표면 경도', `HRC ${specs.surface_hardness_low}-${specs.surface_hardness_high}`],
    ['심부 경도', `HRC ${specs.core_hardness_low}-${specs.core_hardness_high}`],
    ['변형 한도', `총 런아웃 ≤ ${specs.distortion_limit_mm} mm`],
    ['연삭 후처리', specs.grinding_after_ht ? '있음' : '없음 (열처리 후 연삭 수정 불가)'],
    ['수량 / 월 소요', `${mark('lot_size', `${specs.lot_size} EA`)} / 월 ${specs.monthly_volume ?? 'N/A'} EA`],
    ['교정 허용', straightening],
  ];
  if (headline && headlineRoute) {
    details.push(['추천 공정', `${headline.display_name} (${headline.equipment_id})`]);
    details.push(['사이클 타임', `${headline.cycle_time_hr} hr/batch`]);
    details.push(['배치 수', `${headline.batches} batch(es)`]);
  }
  if (specs.delivery_days !== null) {
    const basis = specs.delivery_basis ? ` (${specs.delivery_basis})` : '';
    details.push(['요청 납기', mark('delivery_days', `${specs.delivery_days}일${basis}`)]);
  }
  if (headlineRoute && headlineRoute.lead_time_assessment) {
    const std = headlineRoute.lead_time_days ? ` (표준 ${headlineRoute.lead_time_days}일)` : '';
    details.push(['리드타임', `${LEAD_TIME_TEXT[headlineRoute.lead_time_assessment]}${std}`]);
  }
  details.push(['검사 항목', specs.inspection_requirement ?? '경도 검사 (표면/심부) + 외관 검사']);
  for (const [label, value] of details) {
    row += 1;
    merge(ws, row, 1, 2);
    put(ws, row, 1, label, { bold: true, align: 'right' });
    merge(ws, row, 3, 8);
    put(ws, row, 3, value);
    borderRow(ws, row, 1, 8);
  }
  row += 2;

  // 7. 비고
  merge(ws, row, 1, 8);
  put(ws, row, 1, '비고 / 특기사항', { bold: true, fill: 'FFD9E1F2' });
  borderRow(ws, row, 1, 8);
  const notes: string[] = [];
  const basisItems = missing_specs.filter((m) => m.category === 'quote_basis');
  const checkItems = missing_specs.filter((m) => m.category === 'checklist');
  if (mode === 'provisional' && basisItems.length > 0) {
    notes.push('[ 견적 전제 — 회신 필요 ]');
    for (const m of basisItems) notes.push(`  - ${m.item_name}: ${m.reason}`);
  }
  if (checkItems.length > 0) {
    notes.push('[ 고객 확인 필요 사항 ]');
    for (const m of checkItems) notes.push(`  - ${m.item_name}: ${m.reason}`);
  }
  notes.push('');
  notes.push('[ 일반 조건 ]');
  notes.push(ROUGH_QUOTE_LINE);
  notes.push(mark('delivery_days', `  - 납기: ${specs.delivery_basis ?? 'PO 후'} ${specs.delivery_days}일 요청 기준`));
  notes.push(`  - 포장/방청: ${specs.packing_requirement ?? '미정 (고객 사양 확인 필요)'}`);
  if (specs.ppap_requirement) notes.push(`  - PPAP/FAI: ${specs.ppap_requirement}`);
  notes.push('  - 금액 단위: CNY (부가세 별도)');
  const refs = [...calc.references.monthly_volume, ...calc.references.lot_table];
  if (refs.length > 0) {
    notes.push('');
    notes.push('[ 참고 단가 ]');
    for (const q of refs) notes.push(`  - ${q.display_name} ${q.lot_size} EA: ${q.quote_per_pc_cny} CNY/pc`);
  }
  for (const line of notes) {
    row += 1;
    merge(ws, row, 1, 8);
    put(ws, row, 1, line);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, summary: { total_quote_cny: headline!.total_quote_cny, item_rows } };
}

export async function generateXlsx(input: XlsxInput): Promise<XlsxOutput> {
  if (input.calc.outcome === 'no_route' || input.calc.quotes.length === 0) {
    return { xlsx: null, summary: { total_quote_cny: null, item_rows: [] } };
  }
  const filename = xlsxFilename(input.specs.rfq_number ?? 'N/A');
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) { // 생성 오류면 1회 다시
    try {
      const { buffer, summary } = await buildWorkbook(input);
      return { xlsx: { filename, data_base64: buffer.toString('base64') }, summary };
    } catch (e) {
      lastError = e;
    }
  }
  throw new NeedsAttention('10', `xlsx 생성 실패: ${(lastError as Error)?.message ?? String(lastError)}`);
}
