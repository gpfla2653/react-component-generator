import { stripCodeFences, ensureRenderCall } from './generator';
import { withModelFallback } from './fallback';
import { createSseParser, extractAnthropicText, extractGoogleChunk, isAbortError, mapApiError } from './stream';
import { parseGenerateRequest, type Provider } from './request';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function callGoogleModel(prompt: string, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }

  return (
    candidate?.content?.parts
      ?.map((part) => part.text)
      ?.join('') ?? ''
  );
}

async function callGoogle(prompt: string, apiKey: string): Promise<string> {
  return withModelFallback(GOOGLE_MODELS, (model) => callGoogleModel(prompt, apiKey, model));
}

// --- 스트리밍 ---

async function openAnthropicStream(prompt: string, apiKey: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }
  return response;
}

async function openGoogleStream(
  prompt: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  return response;
}

// 첫 바이트 이전의 실패만 모델 폴백 대상이 된다(스트림이 시작되면 모델을 바꿀 수 없다).
function openStream(
  provider: Provider,
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<Response> {
  return provider === 'google'
    ? withModelFallback(GOOGLE_MODELS, (model) => openGoogleStream(prompt, apiKey, model, signal))
    : openAnthropicStream(prompt, apiKey, signal);
}

async function* readTextDeltas(provider: Provider, upstream: Response): AsyncGenerator<string> {
  const parser = createSseParser();
  const decoder = new TextDecoder();

  for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
    for (const data of parser.push(decoder.decode(chunk, { stream: true }))) {
      if (provider === 'google') {
        const { text, truncated } = extractGoogleChunk(data);
        if (text) yield text;
        if (truncated) {
          throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
        }
      } else {
        const text = extractAnthropicText(data);
        if (text) yield text;
      }
    }
  }
}

// JSON이 아닌 본문은 undefined로 돌려 parseGenerateRequest가 400으로 거부하게 한다.
async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate/stream') {
      try {
        const parsed = parseGenerateRequest(await readJson(req));

        if (!parsed.ok) {
          return Response.json(
            { error: parsed.error },
            { status: parsed.status, headers: CORS_HEADERS }
          );
        }

        const { prompt, apiKey, provider } = parsed.value;
        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        // 클라이언트가 연결을 끊거나 스트림이 취소되면 업스트림 요청도 중단한다.
        const abort = new AbortController();
        req.signal.addEventListener('abort', () => abort.abort());

        const upstream = await openStream(provider, prompt, resolvedKey, abort.signal);
        const encoder = new TextEncoder();

        // NDJSON 이벤트: delta(원문 조각) → done(정규화된 최종 코드) | error
        let closed = false;
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: object) => {
              if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            };
            try {
              let text = '';
              for await (const delta of readTextDeltas(provider, upstream)) {
                text += delta;
                send({ type: 'delta', text: delta });
              }
              send({ type: 'done', code: ensureRenderCall(stripCodeFences(text)) });
            } catch (err) {
              // 중단은 소비자가 이미 떠난 상태이므로 error 이벤트를 보내지 않는다.
              if (!isAbortError(err) && !abort.signal.aborted) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                send({ type: 'error', error: mapApiError(message).error });
              }
            } finally {
              if (!closed) {
                closed = true;
                controller.close();
              }
            }
          },
          cancel() {
            closed = true;
            abort.abort();
          },
        });

        return new Response(body, {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
        });
      } catch (err) {
        const { status, error } = mapApiError(err instanceof Error ? err.message : 'Unknown error');
        return Response.json({ error }, { status, headers: CORS_HEADERS });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const parsed = parseGenerateRequest(await readJson(req));

        if (!parsed.ok) {
          return Response.json(
            { error: parsed.error },
            { status: parsed.status, headers: CORS_HEADERS }
          );
        }

        const { prompt, apiKey, provider } = parsed.value;
        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const text =
          provider === 'google'
            ? await callGoogle(prompt, resolvedKey)
            : await callAnthropic(prompt, resolvedKey);

        const code = ensureRenderCall(stripCodeFences(text));

        return Response.json({ code }, { headers: CORS_HEADERS });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        if (message.includes('503')) {
          return Response.json(
            { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' },
            { status: 503, headers: CORS_HEADERS }
          );
        }

        if (message.includes('429')) {
          return Response.json(
            { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
            { status: 429, headers: CORS_HEADERS }
          );
        }

        return Response.json(
          { error: message },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
