// 생성 요청 본문 검증용 순수 함수. Bun/process.env 의존성 없음(vitest에서 import됨).

export const PROVIDERS = ['anthropic', 'google'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const MAX_PROMPT_LENGTH = 4000;

export interface GenerateRequest {
  prompt: string;
  apiKey?: string;
  provider: Provider;
}

export type ParseResult =
  | { ok: true; value: GenerateRequest }
  | { ok: false; status: 400; error: string };

const fail = (error: string): ParseResult => ({ ok: false, status: 400, error });

export function parseGenerateRequest(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null) return fail('요청 본문이 올바르지 않습니다.');

  const { prompt, apiKey, provider = 'anthropic' } = raw as Record<string, unknown>;

  if (typeof provider !== 'string' || !(PROVIDERS as readonly string[]).includes(provider)) {
    return fail('지원하지 않는 모델 제공사입니다.');
  }
  if (typeof prompt !== 'string' || !prompt.trim()) return fail('프롬프트를 입력해주세요.');
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return fail(`프롬프트는 ${MAX_PROMPT_LENGTH}자 이하로 입력해주세요.`);
  }
  if (apiKey !== undefined && typeof apiKey !== 'string') return fail('API 키 형식이 올바르지 않습니다.');

  return { ok: true, value: { prompt, apiKey, provider: provider as Provider } };
}
