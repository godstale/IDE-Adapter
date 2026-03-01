# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile          # TypeScript build → out/
npm run watch            # Incremental watch build
npm run lint             # ESLint (src/**/*.ts)
```

Build output goes to `out/`. Press **F5** in VS Code to launch the Extension Development Host for manual testing.

**Test client** (requires the extension to be running):
```bash
node test/client.js          # connects to ws://localhost:7200
node test/client.js 7201     # custom port
```

## Architecture

This is a VS Code extension that runs a local **WebSocket server** (default port 7200). External CLI apps connect as clients.

```
activate()
  ├── IdeaLogger          — EventEmitter, 500-entry ring buffer, emits 'entry'
  ├── HandlerRegistry     — topic string → IHandler map
  ├── IdeaServer          — WebSocketServer; injects logger + clientId into each session
  │    └── ClientSession  — per-connection state machine: handshake → request/response loop
  ├── IdeaPanel           — WebviewViewProvider (Activity bar sidebar)
  │    ├── Settings tab   — server toggle, port change, protocol doc buttons, dev info
  │    └── Logs tab       — real-time log stream, inline JSON expand/collapse
  └── ProtocolViewer      — on-demand WebviewPanel for docs/IDEA_*.md files
```

**Module system**: `"module": "Node16"` — all intra-project imports **must** use `.js` extension (e.g. `import { Foo } from './Foo.js'`).

## Adding a New Handler

1. Create `src/handlers/<Name>Handler.ts` implementing `IHandler` from `src/protocol/types.ts`.
2. Register it in `activate()` in `src/extension.ts`: `registry.register('/app/vscode/...', new NameHandler())`.
3. Document the input params in `docs/IDEA_InputProtocol.md` and result shape in `docs/IDEA_OutputProtocol.md`.

## Protocol Rules

- **First message** from client must be `{ type: 'handshake', workspacePath: string }`. Any other message closes the socket.
- Subsequent messages are requests: `{ topic, requestId, params }`. Responses echo `topic` and `requestId`.
- Error responses have `error: { code, message }`; success responses have `result: { ... }`.
- Error codes: `PARSE_ERROR`, `INVALID_REQUEST`, `UNKNOWN_TOPIC`, `WORKSPACE_NOT_FOUND`, `HANDLER_ERROR`.

## Webview ↔ Extension Messaging

`IdeaPanel` (sidebar) uses bidirectional `postMessage`:

| Direction | Message types |
|-----------|--------------|
| Extension → Webview | `serverStatus`, `logEntry`, `allLogs` |
| Webview → Extension | `ready`, `toggleServer`, `applyPort`, `openProtocol` |

The webview sends `ready` on load; the extension replies with current `serverStatus` + full `allLogs` history.

## Git Workflow

Remote: `git@github.com:godstale/IDE-Adapter.git` (SSH) — 기본 브랜치: `main`

**작업 시작 시**
```bash
git checkout main
git pull
git checkout -b feature/<feature-name>
```

**작업 완료 시** (코드 수정 및 검증 후)
```bash
git add <files>          # 관련 파일만 명시적으로 스테이징
git commit -m "feat: ..."
git push -u origin feature/<feature-name>
gh pr create             # PR 생성 (머지는 사용자가 직접 처리)
```

**PR 머지 후**
```bash
git checkout main
git pull
```

- commit 전에 CHANGELOG.md 파일을 업데이트 한다.
- 주요한 변경사항인 경우 어플리케이션 버전을 증가시킨다.
- IDEA input/output 프로토콜은 변경시 항상 버전을 증가해야한다.
- PR 머지는 항상 사용자가 직접 처리한다.

## Version Management

앱 버전과 프로토콜 버전은 항상 함께 관리한다.

### 버전 저장 위치

| 버전 | 위치 |
|------|------|
| 앱 버전 | `package.json` → `"version"` |
| 프로토콜 버전 | `docs/IDEA_InputProtocol.md` / `docs/IDEA_OutputProtocol.md` 상단 버전 테이블 |

### 버전 변경 시 수정 대상 파일

**앱 버전 변경 시** (`package.json` `version` 증가):
- `package.json` — `"version"` 필드
- `README.md` — 상단 버전 테이블 (`App Version`)
- `CHANGELOG.md` — 새 버전 섹션 추가

**프로토콜 변경 시** (파라미터·결과 형식 추가/변경/삭제):
- `docs/IDEA_InputProtocol.md` — 상단 버전 테이블 (`Protocol Version`, `최종 수정`)
- `docs/IDEA_OutputProtocol.md` — 상단 버전 테이블 + handshake 예시 `version` 필드
- `README.md` — 상단 버전 테이블 (`Protocol Version`)
- `CHANGELOG.md` — 해당 버전 섹션에 `Protocol Version` 명시

### 규칙
- 앱 버전과 프로토콜 버전은 현재 동일한 값을 사용한다 (예: 둘 다 `v0.1.2`).
- 프로토콜 변경은 반드시 버전 증가를 동반한다 (하위 호환 변경: patch, 파괴적 변경: minor 이상).
- 핸들러 추가·삭제·파라미터 변경은 모두 프로토콜 변경으로 간주한다.
- 브랜치명은 `feature/`, `fix/`, `docs/` 접두사를 사용한다.
- `.gitignore` 제외 항목: `node_modules/`, `out/`, `.claude/`, `docs/CHAT_HISTORY.md`, `docs/TODO*.md`, `.vscode/`

## Project Management Convention

- When implementing a new feature, update TODO lists before writing code; move completed items to a history file.
- Protocol input/output formats must be kept in sync with `docs/IDEA_InputProtocol.md` / `docs/IDEA_OutputProtocol.md`.
- User-visible changes go in `README.md`.
- Always make TODO list first before writing code.
- Make TODO lists in `docs/TODO.md` and move completed items to `docs/TODO_History.md`.
- Use memory to keep track of project history.
- Use hooks to notify me with alarm sound when a new feature is implemented.