// 스트리밍 응답 처리용 순수 함수들. Bun/process.env 의존성 없음(vitest에서 import됨).

/** SSE 바이트 스트림을 청크 단위로 받아 완성된 이벤트의 data 페이로드만 돌려준다. */
export function createSseParser() {
  let buffer = '';
  return {
    push(chunk: string): string[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      const payloads: string[] = [];
      for (const event of events) {
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) payloads.push(data);
      }
      return payloads;
    },
  };
}

export function extractAnthropicText(data: string): string {
  try {
    const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      return event.delta.text ?? '';
    }
  } catch {
    // 파싱 불가 이벤트는 무시한다.
  }
  return '';
}

export function extractGoogleChunk(data: string): { text: string; truncated: boolean } {
  try {
    const event = JSON.parse(data) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    };
    const candidate = event.candidates?.[0];
    return {
      text: candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
      truncated: candidate?.finishReason === 'MAX_TOKENS',
    };
  } catch {
    return { text: '', truncated: false };
  }
}

/** fetch/스트림 중단(AbortController)으로 발생한 에러인지 판단한다. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/** 에러 메시지의 상태 코드 문자열을 사용자용 한국어 안내와 HTTP 상태로 매핑한다. */
export function mapApiError(message: string): { status: number; error: string } {
  if (message.includes('503')) {
    return { status: 503, error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' };
  }
  if (message.includes('429')) {
    return { status: 429, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  }
  return { status: 500, error: message };
}
