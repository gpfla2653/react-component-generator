import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { STORAGE_KEYS } from '../utils/storage';

const saved = {
  id: 'a',
  prompt: '카드',
  code: 'render(<div />)',
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useComponentGenerator 저장', () => {
  it('localStorage에 저장된 컴포넌트 목록을 초기값으로 복원한다', () => {
    localStorage.setItem(STORAGE_KEYS.components, JSON.stringify([saved]));
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].createdAt).toBeInstanceOf(Date);
  });

  it('컴포넌트를 삭제하면 localStorage에도 반영된다', () => {
    localStorage.setItem(STORAGE_KEYS.components, JSON.stringify([saved]));
    const { result } = renderHook(() => useComponentGenerator());
    act(() => result.current.removeComponent('a'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.components)!)).toEqual([]);
  });

  it('생성에 성공하면 새 컴포넌트가 localStorage에 저장된다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'render(<p />)' }) }),
    );
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('문단', undefined, 'google'));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.components)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].prompt).toBe('문단');
  });
});
