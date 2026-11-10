import { describe, it, expect } from 'vitest';
import { createSseParser, extractAnthropicText, extractGoogleChunk, isAbortError, mapApiError } from './stream';

describe('isAbortError', () => {
  it('AbortError 이름을 가진 에러를 중단으로 판단한다', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('일반 에러와 에러가 아닌 값은 중단이 아니다', () => {
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});

describe('createSseParser', () => {
  it('완성된 이벤트의 data 페이로드를 반환한다', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"a":1}\n\ndata: {"a":2}\n\n')).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('청크 경계에서 잘린 이벤트는 다음 청크와 합쳐 처리한다', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"a"')).toEqual([]);
    expect(parser.push(':1}\n\n')).toEqual(['{"a":1}']);
  });

  it('CRLF 구분자와 event 라인을 처리한다', () => {
    const parser = createSseParser();
    expect(parser.push('event: x\r\ndata: hi\r\n\r\n')).toEqual(['hi']);
  });
});

describe('extractAnthropicText', () => {
  it('text_delta 이벤트에서 텍스트를 꺼낸다', () => {
    const data = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'abc' } });
    expect(extractAnthropicText(data)).toBe('abc');
  });

  it('다른 이벤트나 잘못된 JSON은 빈 문자열을 반환한다', () => {
    expect(extractAnthropicText(JSON.stringify({ type: 'message_start' }))).toBe('');
    expect(extractAnthropicText('not json')).toBe('');
  });
});

describe('extractGoogleChunk', () => {
  it('parts의 텍스트를 이어붙인다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] });
    expect(extractGoogleChunk(data)).toEqual({ text: 'ab', truncated: false });
  });

  it('finishReason이 MAX_TOKENS이면 truncated를 true로 표시한다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'MAX_TOKENS' }] });
    expect(extractGoogleChunk(data).truncated).toBe(true);
  });

  it('잘못된 JSON은 빈 결과를 반환한다', () => {
    expect(extractGoogleChunk('x')).toEqual({ text: '', truncated: false });
  });
});

describe('mapApiError', () => {
  it('503 메시지를 과부하 안내로 매핑한다', () => {
    expect(mapApiError('Gemini API error: 503')).toEqual({
      status: 503,
      error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
    });
  });

  it('429 메시지를 요청 과다 안내로 매핑한다', () => {
    expect(mapApiError('Claude API error: 429')).toEqual({
      status: 429,
      error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    });
  });

  it('그 외는 500과 원본 메시지를 반환한다', () => {
    expect(mapApiError('boom')).toEqual({ status: 500, error: 'boom' });
  });
});
