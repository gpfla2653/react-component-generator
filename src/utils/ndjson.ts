/** NDJSON 스트림을 청크 단위로 받아 완성된 줄만 JSON 객체로 돌려준다. */
export function createNdjsonParser<T = unknown>() {
  let buffer = '';
  return {
    push(chunk: string): T[] {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      return lines.filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
    },
  };
}
