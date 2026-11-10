import type { GeneratedComponent, Provider } from '../types';

export const STORAGE_KEYS = {
  apiKeys: 'rcg:apiKeys',
  provider: 'rcg:provider',
  history: 'rcg:history',
  components: 'rcg:components',
} as const;

export const MAX_HISTORY = 20;

const PROVIDERS: Provider[] = ['anthropic', 'google'];

export function readStorage<T>(key: string, parse: (raw: unknown) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 용량 초과·비공개 모드 등에서는 저장을 포기하고 앱 동작은 유지한다.
  }
}

export function parseComponents(raw: unknown): GeneratedComponent[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.id !== 'string' ||
      typeof item.prompt !== 'string' ||
      typeof item.code !== 'string'
    ) {
      return [];
    }
    const createdAt = new Date(item.createdAt);
    if (Number.isNaN(createdAt.getTime())) return [];
    return [{ id: item.id, prompt: item.prompt, code: item.code, createdAt }];
  });
}

export function parseProvider(raw: unknown): Provider {
  if (PROVIDERS.includes(raw as Provider)) return raw as Provider;
  throw new Error('Invalid provider');
}

export function parseApiKeys(raw: unknown): Record<Provider, string> {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const pick = (p: Provider) => (typeof source[p] === 'string' ? (source[p] as string) : '');
  return { anthropic: pick('anthropic'), google: pick('google') };
}

export function parseHistory(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

export function addToHistory(history: string[], prompt: string): string[] {
  return [prompt, ...history.filter((p) => p !== prompt)].slice(0, MAX_HISTORY);
}
