import { describe, it, expect, beforeEach } from 'vitest';
import {
  readStorage,
  writeStorage,
  parseComponents,
  parseProvider,
  parseApiKeys,
  parseHistory,
  addToHistory,
  MAX_HISTORY,
} from './storage';

beforeEach(() => {
  localStorage.clear();
});

describe('readStorage / writeStorage', () => {
  it('저장한 값을 JSON으로 다시 읽는다', () => {
    writeStorage('k', { a: 1 });
    expect(readStorage('k', (v) => v, null)).toEqual({ a: 1 });
  });

  it('키가 없으면 fallback을 반환한다', () => {
    expect(readStorage('none', (v) => v, 'fb')).toBe('fb');
  });

  it('JSON이 깨져 있으면 fallback을 반환한다', () => {
    localStorage.setItem('k', '{broken');
    expect(readStorage('k', (v) => v, 'fb')).toBe('fb');
  });

  it('parse 함수가 예외를 던지면 fallback을 반환한다', () => {
    writeStorage('k', 1);
    expect(
      readStorage(
        'k',
        () => {
          throw new Error('x');
        },
        'fb',
      ),
    ).toBe('fb');
  });
});

describe('parseComponents', () => {
  it('createdAt 문자열을 Date로 복원한다', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    const [c] = parseComponents([{ id: '1', prompt: 'p', code: 'c', createdAt: iso }]);
    expect(c.createdAt).toBeInstanceOf(Date);
    expect(c.createdAt.toISOString()).toBe(iso);
  });

  it('형식이 맞지 않는 항목은 걸러낸다', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    const result = parseComponents([
      { id: '1', prompt: 'p', code: 'c', createdAt: iso },
      { id: 2 },
      null,
      { id: '3', prompt: 'p', code: 'c', createdAt: 'not-a-date' },
    ]);
    expect(result.map((c) => c.id)).toEqual(['1']);
  });

  it('배열이 아니면 빈 배열을 반환한다', () => {
    expect(parseComponents({})).toEqual([]);
  });
});

describe('parseProvider', () => {
  it('유효한 provider는 그대로 반환한다', () => {
    expect(parseProvider('anthropic')).toBe('anthropic');
  });

  it('알 수 없는 값이면 예외를 던져 fallback으로 이어진다', () => {
    expect(() => parseProvider('openai')).toThrow();
  });
});

describe('parseApiKeys', () => {
  it('provider별 문자열 키만 유지한다', () => {
    expect(parseApiKeys({ anthropic: 'a', google: 3, other: 'x' })).toEqual({
      anthropic: 'a',
      google: '',
    });
  });

  it('객체가 아니면 빈 키를 반환한다', () => {
    expect(parseApiKeys('str')).toEqual({ anthropic: '', google: '' });
  });
});

describe('parseHistory', () => {
  it('문자열만 남긴다', () => {
    expect(parseHistory(['a', 1, 'b'])).toEqual(['a', 'b']);
  });
});

describe('addToHistory', () => {
  it('새 프롬프트를 맨 앞에 추가한다', () => {
    expect(addToHistory(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('중복 프롬프트는 맨 앞으로 옮기고 하나만 유지한다', () => {
    expect(addToHistory(['a', 'b'], 'b')).toEqual(['b', 'a']);
  });

  it(`최대 ${MAX_HISTORY}개까지만 유지한다`, () => {
    const full = Array.from({ length: MAX_HISTORY }, (_, i) => `p${i}`);
    const next = addToHistory(full, 'new');
    expect(next).toHaveLength(MAX_HISTORY);
    expect(next[0]).toBe('new');
  });
});
