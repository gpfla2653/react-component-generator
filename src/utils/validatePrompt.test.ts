import { describe, it, expect } from 'vitest';
import { validatePrompt, MAX_PROMPT_LENGTH } from './validatePrompt';

describe('validatePrompt', () => {
  it('최대 길이는 500자다', () => {
    expect(MAX_PROMPT_LENGTH).toBe(500);
  });

  it('500자 이하면 유효하다', () => {
    expect(validatePrompt('a'.repeat(500))).toEqual({ valid: true, length: 500 });
  });

  it('501자면 길이 초과 에러를 반환한다', () => {
    const result = validatePrompt('a'.repeat(501));
    expect(result.valid).toBe(false);
    expect(result.length).toBe(501);
    expect(result.error).toBe('프롬프트는 500자를 넘을 수 없습니다.');
  });

  it('앞뒤 공백은 길이에서 제외한다', () => {
    expect(validatePrompt(`  ${'a'.repeat(500)}  `).valid).toBe(true);
  });

  it('빈 문자열은 유효하며 길이는 0이다', () => {
    expect(validatePrompt('')).toEqual({ valid: true, length: 0 });
  });
});
