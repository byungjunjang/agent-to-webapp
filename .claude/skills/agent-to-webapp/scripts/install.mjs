#!/usr/bin/env node
// 저장소의 스킬을 유저 스코프로 설치한다. 설치된 쪽의 .env(사용자 API 키)는 지우지도 덮지도 않고,
// 원본의 .env 는 복사하지 않는다. 원본에 없는 옛 파일은 지운다.
//   node .claude/skills/agent-to-webapp/scripts/install.mjs [대상 폴더]
// 대상 기본값: ~/.claude/skills/agent-to-webapp
import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRESERVE = ['.env'];
export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DEST = join(homedir(), '.claude', 'skills', 'agent-to-webapp');

function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p));
  }
  return out;
}

const isPreserved = (rel) => PRESERVE.includes(rel);

export function install(src, dest) {
  if (resolve(src) === resolve(dest)) throw new Error(`원본과 대상이 같다: ${resolve(src)}`);
  const srcFiles = walk(src).filter(f => !isPreserved(f));
  mkdirSync(dest, { recursive: true });
  const removed = [];
  for (const f of walk(dest)) {
    if (isPreserved(f) || srcFiles.includes(f)) continue;
    rmSync(join(dest, f));
    removed.push(f);
  }
  for (const f of srcFiles) {
    mkdirSync(dirname(join(dest, f)), { recursive: true });
    copyFileSync(join(src, f), join(dest, f));
  }
  return { copied: srcFiles.length, removed, keptEnv: existsSync(join(dest, '.env')) };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const dest = resolve(process.argv[2] ?? DEFAULT_DEST);
  try {
    const r = install(SKILL_DIR, dest);
    console.log(`설치: ${dest}`);
    console.log(`복사 ${r.copied}개, 지움 ${r.removed.length}개${r.removed.length ? ` (${r.removed.join(', ')})` : ''}`);
    console.log(r.keptEnv
      ? 'API 키 .env: 있던 것을 그대로 뒀다'
      : `API 키 .env: 아직 없다. ${join(dest, '.env.example')} 를 같은 폴더에 .env 로 복사하고 키를 넣어라`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
