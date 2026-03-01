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
