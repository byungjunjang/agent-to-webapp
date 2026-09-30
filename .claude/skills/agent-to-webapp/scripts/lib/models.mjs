// 관찰과 재검증이 같은 모델을 쓴다. STATUS 에는 별칭(또는 전체 ID)을 적고, API 를 부를 때 ID 로 푼다.
// Claude Code 의 settings `model` 은 별칭을 그대로 받고, Anthropic SDK 는 전체 ID 가 필요하다.
export const MODEL_ALIASES = {
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
  haiku: 'claude-haiku-4-5-20251001',
};
// 웹 앱이 쓸 모델로 관찰한다. 재검증(A2W_MODEL 기본값)과 같아서 4단계 비교에 모델 차이가 끼지 않는다.
export const DEFAULT_MODEL = 'sonnet';

// 별칭 → ID. 'claude-' 로 시작하는 전체 ID 는 그대로. 그 밖은 null.
export function resolveModelId(name) {
  const s = String(name ?? '').trim();
  if (!s) return null;
  if (MODEL_ALIASES[s]) return MODEL_ALIASES[s];
  return s.startsWith('claude-') ? s : null;
}
