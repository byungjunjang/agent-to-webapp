#!/usr/bin/env node
// 저장소의 스킬을 유저 스코프로 설치한다. 설치된 쪽의 .env·.env.*(사용자 키)는 어느 깊이든 지우지도 덮지도 않고,
// 원본의 .env·.env.* 는 복사하지 않는다(.env.example 만 예외). 복사를 마친 뒤 원본에 없는 옛 파일을 지운다.
//   node .claude/skills/agent-to-webapp/scripts/install.mjs            # .claude/skills/ 아래 스킬을 모두 설치
//   node .claude/skills/agent-to-webapp/scripts/install.mjs <대상 폴더>  # 이 스킬 하나만 그 폴더로
import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, basename, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 키를 담는 파일. .env.example 은 빈 틀이라 복사한다.
export const isSecret = (name) => name !== '.env.example' && (name === '.env' || name.startsWith('.env.'));
export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SKILLS_ROOT = dirname(SKILL_DIR);
export const DEFAULT_DEST_ROOT = join(homedir(), '.claude', 'skills');
export const DEFAULT_DEST = join(DEFAULT_DEST_ROOT, basename(SKILL_DIR));

function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p));
  }
  return out;
}

const isPreserved = (rel) => isSecret(basename(rel));
// b 가 a 와 같거나 a 안에 있는가
const within = (a, b) => { const r = relative(a, b); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

export function install(src, dest) {
  const [s, d] = [resolve(src), resolve(dest)];
  if (s === d) throw new Error(`원본과 대상이 같다: ${s}`);
  // 대상은 옛 파일을 지운다. 원본을 품거나 원본 안에 있는 폴더면 원본·다른 파일이 지워진다
  if (within(d, s) || within(s, d)) throw new Error(`대상이 원본의 조상이거나 자손이다: ${d}`);
  const srcFiles = walk(src).filter(f => !isPreserved(f));
  mkdirSync(dest, { recursive: true });
  // 복사를 먼저 한다. 도중에 실패하면 옛 파일이 남아 있어 설치본이 비지 않는다
  for (const f of srcFiles) {
    mkdirSync(dirname(join(dest, f)), { recursive: true });
    copyFileSync(join(src, f), join(dest, f));
  }
  const removed = [];
  for (const f of walk(dest)) {
    if (isPreserved(f) || srcFiles.includes(f)) continue;
    rmSync(join(dest, f));
    removed.push(f);
  }
  return { copied: srcFiles.length, removed, keptEnv: existsSync(join(dest, '.env')) };
}

// skillsRoot 아래의 폴더 하나하나를 스킬로 보고 destRoot/<이름> 으로 설치한다.
// 스킬이 둘 이상이면 설치 절차가 갈라지지 않게 한 번에 한다.
export function installAll(skillsRoot, destRoot) {
  const names = readdirSync(skillsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
  return names.map(name => {
    const dest = join(destRoot, name);
    return { name, dest, ...install(join(skillsRoot, name), dest) };
  });
}

// 대상 폴더 인자. 옵션처럼 보이거나 폴더 이름이 스킬 이름과 다르면 거부한다. 엉뚱한 폴더를 비우지 않게.
export function resolveTargetArg(arg) {
  if (arg.startsWith('-')) throw new Error(`옵션은 없다: ${arg}. 인자 없이 부르거나 대상 폴더 경로를 준다`);
  const dest = resolve(arg);
  if (basename(dest) !== basename(SKILL_DIR)) throw new Error(`대상 폴더 이름이 ${basename(SKILL_DIR)} 여야 한다: ${dest}`);
  return dest;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const arg = process.argv[2];
    const results = arg
      ? [{ name: basename(SKILL_DIR), dest: resolveTargetArg(arg), ...install(SKILL_DIR, resolveTargetArg(arg)) }]
      : installAll(SKILLS_ROOT, DEFAULT_DEST_ROOT);
    for (const r of results) {
      console.log(`설치: ${r.dest}`);
      console.log(`  복사 ${r.copied}개, 지움 ${r.removed.length}개${r.removed.length ? ` (${r.removed.join(', ')})` : ''}`);
      // .env.example 이 있는 스킬만 API 키를 쓴다. lite 는 쓰지 않아 이 줄이 나오지 않는다
      if (existsSync(join(r.dest, '.env.example'))) {
        console.log(r.keptEnv
          ? '  API 키 .env: 있던 것을 그대로 뒀다'
          : `  API 키 .env: 아직 없다. ${join(r.dest, '.env.example')} 를 같은 폴더에 .env 로 복사하고 키를 넣어라`);
      }
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
