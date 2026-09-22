import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// lite 는 설치본이 혼자서도 돌아야 해서 이 둘을 복사해 갖는다. 복사본이 원본에서 어긋나면 여기서 잡는다.
const PAIRS = [
  ['.claude/skills/agent-to-webapp/scripts/lib/md.mjs', '.claude/skills/agent-to-webapp-lite/scripts/lib/md.mjs'],
  ['.claude/skills/agent-to-webapp/references/decision-axes.md', '.claude/skills/agent-to-webapp-lite/references/decision-axes.md'],
];

for (const [src, dst] of PAIRS) {
  test(`복사본이 원본과 바이트 동일: ${dst}`, () => {
    assert.deepEqual(readFileSync(dst), readFileSync(src), `${src} 를 ${dst} 로 다시 복사하라`);
  });
}

test('lite md.mjs 가 정식과 같은 함수를 내보낸다', async () => {
  const lite = await import('../.claude/skills/agent-to-webapp-lite/scripts/lib/md.mjs');
  for (const name of ['normalize', 'isBlank', 'hasHeading', 'sectionBody']) {
    assert.equal(typeof lite[name], 'function', name);
  }
  assert.equal(lite.sectionBody('## a\nx\n## b\ny', '## a'), 'x');
  assert.equal(lite.sectionBody('## a\nx', '## z'), null);
});
