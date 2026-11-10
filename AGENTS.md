# AGENTS.md

## Operational Commands

- 패키지 매니저는 `bun` 고정. npm/yarn/pnpm 사용 금지 (`bun.lock` 존재).
- 전체 개발 서버(API + Vite): `bun run dev`
- API 서버만: `bun run server` (포트 3002)
- 테스트 전체: `bun run test` (vitest, `src/**`와 `server/**` 모두 포함). `bun test`는 Bun 내장 러너를 호출하므로 사용 금지.
- 단일 테스트: `bun run test -- server/generator.test.ts`
- 린트: `bun run lint`
- 빌드(타입 검사 포함): `bun run build`
- 변경 후 완료 보고 전에 `bun run lint`, `bun run test`, `bun run build`를 실행한다.

## Golden Rules

### Immutable

- 사용자 API 키를 로그, 응답 본문, 에러 메시지에 포함하지 않는다. 키는 요청 바디로만 서버에 전달되고(`src/hooks/useComponentGenerator.ts:49`) 서버에서 `resolveApiKey`로 결정된다(`server/index.ts:64`).
- 서버 환경변수 키 값을 클라이언트로 내려보내지 않는다. `/api/config`는 존재 여부(boolean)만 반환한다(`server/index.ts:150-153`).
- `.env`는 커밋하지 않는다(`.gitignore`). 키를 소스에 하드코딩하지 않는다.

### Do's & Don'ts

- Do: AI 응답 정규화 로직(코드펜스 제거, render 호출 보정)은 `server/generator.ts`의 순수 함수에 두고 테스트를 함께 작성한다. 근거: `server/generator.test.ts`.
- Do: 모델 폴백은 `withModelFallback`(`server/fallback.ts`)으로 구현한다. 근거: `server/index.ts:135`.
- Don't: 에러 메시지 문자열에 상태 코드를 포함하는 규칙을 깨지 않는다. `callAnthropic`/`callGoogleModel`은 `API error: ${status}`를 던지고, 핸들러가 `message.includes('503'|'429')`로 분기한다(`server/index.ts:85,112,194,201`). 메시지 형식을 바꾸면 사용자용 한국어 안내가 사라진다.
- Don't: 생성 코드에 `import`나 TypeScript 문법을 허용하도록 시스템 프롬프트를 완화하지 않는다. 미리보기는 react-live `noInline` 모드이며 React가 전역으로 주입된다(`server/index.ts:11,20`, `src/components/LivePreview.tsx:14`).

### 팀 고유 규칙 (코드 분석 기반)

- Hard Constraint: 생성 코드는 반드시 `render(<Component />)` 호출을 가져야 미리보기가 그려진다(`noInline`). 이 보정은 `ensureRenderCall`이 담당한다(`server/generator.ts:16-23`, 호출 `server/index.ts:188`). 프롬프트와 보정 로직 중 한쪽만 바꾸지 않는다.
- Double Defense: render 호출 요구가 시스템 프롬프트(`server/index.ts:12`)와 `ensureRenderCall` 후처리 두 곳에서 방어된다. 하나를 제거하면 모델이 호출을 빠뜨릴 때 빈 미리보기가 발생한다. 마찬가지로 "코드펜스 금지"(`server/index.ts:16`)와 `stripCodeFences`도 이중 방어다.
- Double Defense: 포트 3002가 `server/index.ts:139`와 `vite.config.ts:11`(프록시 target) 두 곳에 중복되어 있다. 변경 시 둘을 함께 수정한다.
- Asymmetry: Google 경로만 `finishReason === 'MAX_TOKENS'` 잘림 검사와 모델 폴백이 있고(`server/index.ts:5,123,135`), Anthropic 경로는 단일 모델에 `stop_reason` 검사가 없다. 한쪽에 처리를 추가할 때 다른 쪽 필요 여부를 확인한다.
- Test Boundary: 테스트는 순수 로직(`server/generator.ts`, `server/fallback.ts`)과 `PromptInput`에만 있다. `server/index.ts`(Bun.serve 부수효과), `useComponentGenerator`, `LivePreview`, `App`은 테스트가 없다. 이 영역을 수정하면 로직을 순수 함수로 분리해 테스트 가능하게 만든다.
- Security Boundary: Google API 키는 URL 쿼리스트링에 실려 전송된다(`server/index.ts:99`). 이 URL을 로그나 에러 메시지에 출력하지 않는다. 서버 CORS는 `*`(`server/index.ts:52`)이므로 인증이 필요한 엔드포인트를 추가할 때는 재검토한다.
- 타입 중복: `Provider` 타입이 `server/index.ts:57`과 `src/types/index.ts:1`에 각각 정의되어 있다. 프로바이더를 추가할 때 양쪽과 `ENV_KEYS`, 분기 로직을 모두 갱신한다.

## Project Context

- 프롬프트로 React 컴포넌트를 생성하고 실시간 미리보기를 제공하는 도구.
- Stack: React 19, TypeScript, Vite, react-live, Bun(API 프록시), Vitest, Testing Library, ESLint.

## Standards & References

- 설치·실행·기능 설명은 `README.md` 참조.
- 서버 코드 작업은 `server/AGENTS.md` 참조.
- Git: 커밋 메시지는 `타입: 한국어 요약` (`feat`, `fix`, `refactor`, `chore`), 마침표 없음. `main`/`master`에 직접 커밋하지 않고 브랜치를 만든다.
- UI 문구와 사용자 에러 메시지는 한국어로 작성한다.
- Maintenance Policy: 이 파일의 규칙과 코드 사이에 괴리(라인 번호 이동, 삭제된 파일, 변경된 포트 등)를 발견하면 즉시 업데이트를 제안한다.
