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

function ndjsonResponse(events: object[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      controller.close();
    },
  });
  return { ok: true, body };
}

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([
      { type: 'delta', text: 'render(' },
      { type: 'delta', text: '<p />)' },
      { type: 'done', code: 'render(<p />)' },
    ])));
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('문단', undefined, 'google'));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.components)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].prompt).toBe('문단');
    expect(stored[0].code).toBe('render(<p />)');
  });

  it('스트림 error 이벤트를 받으면 에러를 설정하고 컴포넌트를 저장하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([
      { type: 'delta', text: 'const' },
      { type: 'error', error: '요청이 너무 많습니다.' },
    ])));
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('문단', undefined, 'google'));
    expect(result.current.error).toBe('요청이 너무 많습니다.');
    expect(result.current.components).toHaveLength(0);
  });

  it('fetch에 AbortSignal을 전달하고 언마운트 시 중단한다', async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useComponentGenerator());
    act(() => {
      void result.current.generate('문단', undefined, 'google');
    });
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it('중단된 요청은 에러를 표시하지 않는다', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('문단', undefined, 'google'));
    expect(result.current.error).toBeNull();
  });

  it('재생성하면 이전 요청을 중단하고 이전 스트림이 새 코드에 섞이지 않는다', async () => {
    let pushFirst!: (event: object) => void;
    const encoder = new TextEncoder();
    const firstBody = new ReadableStream<Uint8Array>({
      start(controller) {
        pushFirst = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, body: firstBody })
      .mockResolvedValueOnce(ndjsonResponse([
        { type: 'delta', text: 'second' },
        { type: 'done', code: 'second' },
      ]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useComponentGenerator());

    act(() => {
      void result.current.generate('첫번째', undefined, 'google');
    });
    const firstSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(() => result.current.generate('두번째', undefined, 'google'));

    expect(firstSignal.aborted).toBe(true);
    await act(async () => {
      pushFirst({ type: 'done', code: 'first' });
    });
    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].code).toBe('second');
  });

  it('done 이벤트 없이 스트림이 끝나면 에러를 설정한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ndjsonResponse([{ type: 'delta', text: 'x' }])));
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('문단', undefined, 'google'));
    expect(result.current.error).not.toBeNull();
    expect(result.current.components).toHaveLength(0);
  });
});
