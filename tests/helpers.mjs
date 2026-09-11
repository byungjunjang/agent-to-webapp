import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// 임시 작업 폴더(<이름>-app 역할)를 만들고 경로를 돌려준다.
export function makeApp(prefix = 'a2w-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

// appDir 기준 상대 경로에 파일을 쓴다. 중간 폴더는 만든다. LF·UTF-8.
export function write(appDir, rel, text) {
  const p = join(appDir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text, 'utf8');
  return p;
}

export const A2W = 'docs/agent-to-webapp';
