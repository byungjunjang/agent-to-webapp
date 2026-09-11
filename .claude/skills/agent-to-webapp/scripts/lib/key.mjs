// API 키가 어디서 오는지 찾는다. 키 값은 절대 돌려주지도 출력하지도 않는다.
// 우선순위는 Node 의 --env-file 과 같다: 셸 환경변수 > 프로젝트 verify/.env > 스킬 .env
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const KEY_NAME = 'ANTHROPIC_API_KEY';
export const SKILL_ENV = '.env';
export const PROJECT_ENV = join('docs', 'agent-to-webapp', 'verify', '.env');
export const LABELS = { env: '셸 환경변수', project: '프로젝트 verify/.env', skill: '스킬 .env' };

// .env 파일에 비어 있지 않은 ANTHROPIC_API_KEY 줄이 있는가. 값은 확인만 하고 버린다.
export function fileHasKey(p) {
  if (!existsSync(p)) return false;
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*(.*)$/);
    if (m && m[1].replace(/^["']|["']$/g, '').trim() !== '') return true;
  }
  return false;
}

export function findKey({ skillDir, appDir, env = process.env }) {
  const sources = [];
  if (env[KEY_NAME] && String(env[KEY_NAME]).trim() !== '') sources.push('env');
  const projectFile = join(appDir, PROJECT_ENV);
  if (fileHasKey(projectFile)) sources.push('project');
  const skillFile = join(skillDir, SKILL_ENV);
  if (fileHasKey(skillFile)) sources.push('skill');
  return { active: sources[0] ?? null, sources, skillFile, projectFile };
}
