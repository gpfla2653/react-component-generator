import { describe, it, expect } from 'vitest';
import { parseGenerateRequest, MAX_PROMPT_LENGTH } from './request';

describe('parseGenerateRequest', () => {
  it('유효한 요청은 값을 그대로 반환한다', () => {
    expect(parseGenerateRequest({ prompt: '버튼', apiKey: 'k', provider: 'google' })).toEqual({
      ok: true,
      value: { prompt: '버튼', apiKey: 'k', provider: 'google' },
    });
  });

  it('provider를 생략하면 anthropic으로 처리한다', () => {
    const result = parseGenerateRequest({ prompt: '버튼' });
    expect(result.ok && result.value.provider).toBe('anthropic');
  });

  it('허용되지 않은 provider는 400으로 거부한다', () => {
    const result = parseGenerateRequest({ prompt: '버튼', apiKey: 'k', provider: 'foo' });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('prompt가 문자열이 아니면 400으로 거부한다', () => {
    expect(parseGenerateRequest({ prompt: { a: 1 } })).toMatchObject({ ok: false, status: 400 });
  });

  it('prompt가 비어 있으면 400으로 거부한다', () => {
    expect(parseGenerateRequest({ prompt: '' })).toMatchObject({ ok: false, status: 400 });
  });

  it('prompt가 공백뿐이면 400으로 거부한다', () => {
    expect(parseGenerateRequest({ prompt: '   \n' })).toMatchObject({ ok: false, status: 400 });
  });

  it('prompt가 길이 상한을 넘으면 400으로 거부한다', () => {
    const result = parseGenerateRequest({ prompt: 'a'.repeat(MAX_PROMPT_LENGTH + 1) });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('apiKey가 문자열이 아니면 400으로 거부한다', () => {
    expect(parseGenerateRequest({ prompt: '버튼', apiKey: 123 })).toMatchObject({ ok: false, status: 400 });
  });

  it('본문이 객체가 아니면 400으로 거부한다', () => {
    expect(parseGenerateRequest(null)).toMatchObject({ ok: false, status: 400 });
    expect(parseGenerateRequest('x')).toMatchObject({ ok: false, status: 400 });
  });
});
