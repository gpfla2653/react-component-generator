# server/AGENTS.md

## Module Context

Bun 런타임에서 실행되는 AI API 프록시(`index.ts`)와, Bun 의존성이 없는 순수 로직(`generator.ts`, `fallback.ts`)으로 구성된다. 프론트엔드는 Vite 프록시를 통해 `/api/*`로 호출한다.

## Tech Stack & Constraints

- 실행은 Bun, 테스트는 vitest(Node/jsdom 환경, `vite.config.ts`의 `server/**/*.test.ts`).
- 외부 HTTP는 내장 `fetch`만 사용한다. SDK나 axios를 추가하지 않는다 (`server/index.ts:69,101`).
- 환경변수는 `process.env.ANTHROPIC_API_KEY`, `process.env.GOOGLE_API_KEY`만 사용한다(`server/index.ts:59-62`).

## Implementation Patterns

- 새 엔드포인트는 `Bun.serve`의 `fetch` 핸들러 안에서 `url.pathname`과 `req.method`로 분기하고, 모든 응답에 `CORS_HEADERS`를 붙인다(`server/index.ts:141-218`).
- 새 프로바이더는 `callXxx(prompt, apiKey): Promise<string>` 시그니처로 만들고, `Provider` 타입, `ENV_KEYS`, `/api/generate` 분기를 함께 갱신한다.
- 테스트 파일은 대상 파일 옆에 `<name>.test.ts`로 둔다.

## Testing Strategy

- `bun run test -- server/` 로 서버 테스트만 실행.
- 테스트할 로직은 `Bun.serve`를 호출하지 않는 별도 모듈로 분리한다.

## Local Golden Rules

- Hard Constraint: `generator.ts`, `fallback.ts`에서 `Bun.*` API나 `process.env`를 사용하지 않는다. 두 파일은 vitest(Node)에서 import되므로 Bun 전용 API를 쓰면 테스트가 깨진다. 근거: `server/generator.ts:1-2` 주석, `vite.config.ts:20`.
- Test Boundary: `index.ts`를 import하는 테스트를 작성하지 않는다. import 시점에 서버가 포트 3002에서 기동된다(`server/index.ts:138`).
- Do: `withModelFallback`은 모든 모델이 실패하면 마지막 에러를 던진다. 모델을 `GOOGLE_MODELS`에 추가할 때 우선순위 순서를 유지한다(`server/index.ts:5`).
- Don't: 상태 코드 문자열(`503`, `429`)이 에러 메시지에 들어가는 형식을 바꾸지 않는다(`server/index.ts:194,201`).
