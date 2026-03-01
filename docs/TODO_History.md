# TODO History

완료된 작업 항목을 날짜 순으로 기록합니다.

---

## Phase 1: 통신 인프라

- [x] `src/protocol/types.ts` — 공유 TypeScript 인터페이스 정의 (IHandler, HandshakeMessage, RequestMessage, ResponseMessage 등)
- [x] `src/handlers/HandlerRegistry.ts` — topic 문자열 → IHandler 맵 구현
- [x] `src/server/IdeaServer.ts` — WebSocketServer 래퍼 (logger 주입)
- [x] `src/session/ClientSession.ts` — 연결별 handshake + 요청/응답 라우팅 (clientId, logger 포함)
- [x] `src/extension.ts` — activate/deactivate, 상태바, 전체 컴포넌트 연결
- [x] `package.json` / `tsconfig.json` — 프로젝트 설정 (module: Node16, ws v8)

---

## Phase 2: 로깅 + 패널 UI

- [x] `src/logger/IdeaLogger.ts` — EventEmitter + 500개 링 버퍼
- [x] `src/panel/IdeaPanel.ts` — WebviewPanel (에디터 탭) singleton: Settings + Logs 탭
  - 사이드바(WebviewViewProvider) → 메인 에디터 탭(WebviewPanel) singleton으로 전환 완료
- [x] `src/panel/ProtocolViewer.ts` — Input/Output 프로토콜 docs 뷰어
- [x] `test/client.js` — Node.js WebSocket 테스트 클라이언트 (`node test/client.js [port]`)
- [x] `media/idea-icon.svg` — Activity bar 아이콘 (모노크롬 SVG)
- [x] 각 src/ 서브디렉터리에 CLAUDE.md 추가 (server, session, handlers, protocol, logger, panel)
- [x] `docs/ProjectOverview.md`, `docs/IDEA_InputProtocol.md`, `docs/IDEA_OutputProtocol.md` 작성
- [x] `CHAT_HISTORY.md` — 요청 이력 파일 생성

---

## Phase 3: Edit 핸들러

- [x] `src/handlers/FindHandler.ts` — `/app/vscode/edit/find` 구현
- [x] `src/handlers/ReplaceHandler.ts` — `/app/vscode/edit/replace` 구현
- [x] `extension.ts`에 FindHandler, ReplaceHandler 등록
- [x] `docs/IDEA_InputProtocol.md` / `docs/IDEA_OutputProtocol.md` 업데이트

---

## Phase 4: Navigation 핸들러

- [x] `src/handlers/DefinitionHandler.ts` — `/app/vscode/nav/definition` 구현
- [x] `src/handlers/ReferencesHandler.ts` — `/app/vscode/nav/references` 구현
- [x] `extension.ts`에 DefinitionHandler, ReferencesHandler 등록
- [x] `docs/IDEA_InputProtocol.md` / `docs/IDEA_OutputProtocol.md` 업데이트

---

## 프로젝트 관리

- [x] `docs/TODO.md` / `docs/TODO_History.md` 파일 구성 (프로젝트 관리 규칙 도입)
- [x] `MEMORY.md` — 프로젝트 핵심 정보 자동 메모리 유지

---

## 아이콘 교체 + UI 자동열기 분리 — 2026-03-01

- [x] `media/idea-icon.svg` — 220V 유럽/한국식 플러그 아이콘으로 교체
- [x] `package.json` — `idea.panel.autoOpen` 설정 추가 (default: false)
- [x] `src/extension.ts` — 서버 autoStart / 패널 autoOpen 분리
- [x] `src/panel/IdeaPanel.ts` — Settings 탭 Panel 섹션 + `panelSettings` 메시지 + `applyAutoOpen` 핸들러
- [x] `test/suite.js` — definition 테스트 위치 수정 (import문 → 선언부 위치로 변경, 워크스페이스 없이도 통과)

---

## 테스트 버그 수정 + DefinitionHandler 개선 — 2026-03-01

- [x] `test/suite.js` — find/replace 패턴이 테스트 파일 자체를 매칭하는 문제: `include: 'src/**/*.ts'` 추가
- [x] `test/suite.js` — ReplaceHandler가 suite.js를 실제로 수정하는 버그 수정
- [x] `test/suite.js` — `req()` / `rawReq()` 에 requestId 회색 출력 추가 (extension 로그 매칭용)
- [x] `src/handlers/DefinitionHandler.ts` — TS 언어 서버 대기 200ms → 1500ms 증가

---

## test/test.js — 대화형 CLI 테스트 도구 — 2026-03-01

- [x] `test/test.js` — `find / replace / def / ref` 명령 구현 (WebSocket 연결, 결과 출력)
- [x] `--include, --exclude, --regex, --case, --port, --help` 옵션 파싱
- [x] `def / ref` — 2단계 대화형 (find → readline 번호 선택 → definition/references 요청)
- [x] `test/HOWTO_TEST.md` — 사용법 문서 작성

---

## Phase 5: DiagnosticHandler + SymbolHandler + 아이콘 변경 — 2026-03-02

- [x] `src/handlers/DiagnosticHandler.ts` — `/app/vscode/diag/list` 구현
  - `filePath`: `string | string[]` 지원 (단일/복수 파일 동시 진단)
  - `severity` 필터: `error | warning | information | hint | all`
  - `showTextDocument` 호출로 언어 서버 분석 트리거 (단일 1500ms, 복수 2000ms 대기)
  - 상대 경로 자동 해석 (`resolveFilePath()`)
- [x] `src/handlers/SymbolHandler.ts` — `/app/vscode/nav/symbols` 구현
  - `DocumentSymbol[]` (계층적) + `SymbolInformation[]` (평탄) 두 형식 자동 처리
  - `query` 파라미터로 이름 부분 일치 필터링
  - 상대 경로 자동 해석
- [x] `src/extension.ts` — DiagnosticHandler, SymbolHandler import + register
- [x] `media/idea-icon.svg` — 플러그+소켓(side-view) 디자인으로 교체
- [x] `test/suite.js` — DiagnosticHandler 테스트 섹션 추가
- [x] `test/suite.js` — SymbolHandler 테스트 섹션 추가
- [x] `test/test.js` — `diag` / `sym` 명령 추가 (`--severity`, `--query` 옵션)
- [x] `test/HOWTO_TEST.md` — diag, sym 명령 사용법 추가
- [x] `docs/IDEA_InputProtocol.md` — 두 토픽 파라미터 문서 추가
- [x] `docs/IDEA_OutputProtocol.md` — 두 토픽 결과 문서 추가
- [x] `README.md` — Supported Topics 테이블에 두 토픽 추가

---

## 버전 관리 + 문서 정비 — 2026-03-02

- [x] `docs/IDEA_InputProtocol.md` / `docs/IDEA_OutputProtocol.md` — 프로토콜 버전 `v0.1.2` 기록
- [x] `README.md` — App Version / Protocol Version 테이블 추가, handshake 예시 버전 갱신
- [x] `CHANGELOG.md` — `[0.1.2]` 섹션 추가 (`Protocol Version: v0.1.2` 명시)
- [x] `CLAUDE.md` — 버전 관리 규칙 섹션 추가 (버전 저장 위치, 변경 시 수정 대상 파일, 규칙)
- [x] `.claude/commands/deploy-package.md` — VSIX 재패키징 슬래시 명령어 생성

---

## Settings UI — Auto start on VS Code startup — 2026-03-02

- [x] `src/panel/IdeaPanel.ts` — Settings > Server 섹션에 "Auto start on VS Code startup" 체크박스 추가
  - `ready` 시 `idea.server.autoStart` 값 → `serverSettings` 메시지로 웹뷰에 전송
  - `applyAutoStart` 커맨드 수신 시 `idea.server.autoStart` Global 설정 저장
  - JS: 체크박스 change 이벤트 핸들러, `serverSettings` 메시지 처리
