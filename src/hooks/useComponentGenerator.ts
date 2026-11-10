import { useState, useCallback, useEffect, useRef } from 'react';
import { STORAGE_KEYS, parseComponents, readStorage, writeStorage } from '../utils/storage';
import { createNdjsonParser } from '../utils/ndjson';
import type { GeneratedComponent, Provider } from '../types';

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  streamingCode: string;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useState<GeneratedComponent[]>(() =>
    readStorage(STORAGE_KEYS.components, parseComponents, []),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [streamingCode, setStreamingCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.components, components);
  }, [components]);

  // 언마운트 시 진행 중인 스트림을 중단한다.
  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    // 이전 요청이 남아 있으면 중단한다(재생성 경합 방지).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setStreamingCode('');

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      const parser = createNdjsonParser<StreamEvent>();
      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      let finalCode: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done || controller.signal.aborted) break;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) {
          if (event.type === 'delta') {
            setStreamingCode((prev) => prev + event.text);
          } else if (event.type === 'error') {
            throw new Error(event.error);
          } else {
            finalCode = event.code;
          }
        }
      }

      if (controller.signal.aborted) return;

      if (finalCode === null) {
        throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: finalCode,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev]);
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      // 새 요청에 밀려난 이전 요청은 진행 중인 요청의 상태를 건드리지 않는다.
      if (abortRef.current === controller) {
        setIsLoading(false);
        setStreamingCode('');
      }
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, []);

  return { components, isLoading, streamingCode, error, generate, removeComponent, clearAll };
}
