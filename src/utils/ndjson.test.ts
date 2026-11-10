import { describe, it, expect } from 'vitest';
import { createNdjsonParser } from './ndjson';

describe('createNdjsonParser', () => {
  it('완성된 줄을 JSON 객체로 반환한다', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{"type":"delta","text":"a"}\n{"type":"done"}\n')).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'done' },
    ]);
  });

  it('청크 경계에서 잘린 줄은 다음 청크와 합쳐 처리한다', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{"type":"del')).toEqual([]);
    expect(parser.push('ta"}\n')).toEqual([{ type: 'delta' }]);
  });
});
