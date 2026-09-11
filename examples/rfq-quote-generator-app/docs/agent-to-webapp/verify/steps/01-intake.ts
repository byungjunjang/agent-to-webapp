// 단계 1: 입력 접수 (코드). 파일 구성을 검사하고 job_id 와 접수일을 만든다.
import { randomUUID } from 'node:crypto';
import type { InputFile } from '../lib/types.ts';

export interface IntakeInput {
  files: InputFile[];
  received_at: string; // ISO 8601
}

export interface IntakeOutput {
  job_id: string;
  received_date: string; // YYYY-MM-DD, Asia/Shanghai
  files: InputFile[];
}

const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_PDF_PAGES = 100;

export class IntakeError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(`입력 파일 구성이 틀리다: ${problems.join('; ')}`);
    this.name = 'IntakeError';
    this.problems = problems;
  }
}

/** 압축 객체 스트림 안의 페이지는 세지 못한다. 0 이면 판단 보류. */
function pdfPageCount(buf: Buffer): number {
  const m = buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}

export function intake(input: IntakeInput): IntakeOutput {
  const problems: string[] = [];
  const rfq = input.files.filter((f) => f.role === 'rfq_email');
  const drawings = input.files.filter((f) => f.role === 'drawing');
  if (rfq.length !== 1) problems.push(`rfq_email 파일은 정확히 1개여야 한다 (지금 ${rfq.length}개)`);
  if (drawings.length < 1) problems.push('drawing 파일이 1개 이상 필요하다');
  for (const f of drawings) {
    if (f.media_type !== 'application/pdf') problems.push(`도면은 PDF 여야 한다: ${f.name}`);
  }
  for (const f of input.files) {
    if (f.media_type !== 'application/pdf') continue;
    const buf = Buffer.from(f.data_base64, 'base64');
    if (buf.length > MAX_PDF_BYTES) problems.push(`${f.name}: ${(buf.length / 1048576).toFixed(1)}MB, 32MB 초과`);
    const pages = pdfPageCount(buf);
    if (pages > MAX_PDF_PAGES) problems.push(`${f.name}: ${pages}쪽, 100쪽 초과`);
  }
  if (problems.length > 0) throw new IntakeError(problems);

  const received_date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(input.received_at));

  return { job_id: randomUUID(), received_date, files: input.files };
}
