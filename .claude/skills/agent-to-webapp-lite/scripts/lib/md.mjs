// 마크다운 산출물을 검사할 때 공통으로 쓰는 헬퍼. 파서가 아니라 줄 단위 검사다.
export function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

export function isBlank(s) {
  return !s || s.trim() === '';
}

export function hasHeading(text, heading) {
  return normalize(text).split('\n').some(l => l.trim().startsWith(heading));
}

// heading 줄 다음부터 다음 '## ' 줄 전까지. 헤딩이 없으면 null. 끝의 빈 줄은 뗀다.
export function sectionBody(text, heading) {
  const lines = normalize(text).split('\n');
  const start = lines.findIndex(l => l.trim().startsWith(heading));
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    out.push(lines[i]);
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.join('\n');
}
