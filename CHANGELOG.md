# Changelog

All notable changes to **IDEA — IDE Adapter** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.1.6] — 2026-03-02

> **Protocol Version: v0.1.6**

### Added
- **LocalHistoryListHandler** (`/app/vscode/localhistory/list`): VS Code 로컬 저장 이력 목록 조회.
  - `filePath` 파라미터 지정 시 해당 파일의 로컬 저장 이력 반환 (이력 없으면 빈 배열).
  - 결과: `entries[]` (id, timestamp, timestampLabel, source?), `totalCount`.
- **LocalHistoryDiffHandler** (`/app/vscode/localhistory/diff`): 두 로컬 저장 시점 간 unified diff 반환.
  - `fromId` 생략 시 현재 파일을 기준으로 비교. `toId` 생략 시 현재 파일이 대상.
  - `fromId`, `toId` 동시 생략 → `INVALID_REQUEST`.
  - 존재하지 않는 ID → `INVALID_REQUEST`.
  - LCS DP 기반 unified diff 계산 (외부 패키지 없음, 3줄 context, fallback 지원).
- **LocalHistoryRollbackHandler** (`/app/vscode/localhistory/rollback`): 파일을 특정 로컬 저장 시점으로 복원.
  - `filePath` + `toId` 필수.
  - 결과: `filePath`(절대), `restoredId`, `restoredLabel`(타임스탬프 문자열).
- **LocalHistoryService** (`src/handlers/LocalHistoryService.ts`): 로컬 히스토리 공통 서비스.
  - `context.globalStorageUri.fsPath`에서 `Code/User/History/` 디렉토리 자동 도출.
  - 전체 서브디렉토리 스캔으로 `entries.json` 파싱 및 파일별 이력 탐색.
  - VS Code / Cursor 모두 동작.
- **test/test.js**: `lhlist`, `lhdiff`, `lhrollback` 커맨드 추가.
- **test/suite.js**: `/app/vscode/localhistory/list|diff|rollback` 테스트 섹션 추가 (10개 케이스).

### Changed
- 프로토콜 버전 v0.1.6으로 업데이트.
- `capabilities` 배열에 3개 신규 localhistory 토픽 추가.
- **README**: IDE Adapter Skill 연동 필수 안내 추가, Quick Install 섹션 추가.
- **패키지 아이콘**: `media/icon.png` 설정 (`package.json` `icon` 필드).
- **.vscodeignore**: 불필요한 대형 이미지 파일 제외 항목 추가.

---

## [0.1.5] — 2026-03-02

> **Protocol Version: v0.1.5**

### Added
- **FileRollbackHandler** (`/app/vscode/history/rollback`): 파일을 특정 커밋 시점으로 복원하고 디스크에 자동 저장.
  - `filePath` + `toIndex` 파라미터 지원 (1=HEAD, N=HEAD~(N-1)).
  - `repository.show(ref, path)`로 커밋 시점의 파일 내용 획득.
  - `vscode.workspace.fs.writeFile()`로 디스크에 직접 저장.
  - 결과에 `filePath`(절대), `toRef`(git ref), `restoredIndex` 반환.
  - 에러 케이스: `toIndex < 1` → `INVALID_REQUEST`, git/ref 오류 → `HANDLER_ERROR`.
- **test/test.js**: `rollback` 커맨드 추가 (`node test/test.js rollback <filePath> <toIndex>`).
- **test/suite.js**: `/app/vscode/history/rollback` 테스트 섹션 추가 (5개 케이스).

### Changed
- 프로토콜 버전 v0.1.5로 업데이트.
- `capabilities` 배열에 `/app/vscode/history/rollback` 추가.

---

## [0.1.4] — 2026-03-02

> **Protocol Version: v0.1.4**

### Added
- **FileHistoryHandler** (`/app/vscode/history/list`): 파일의 git 커밋 이력 목록 조회.
  - `filePath` + `maxCount` 파라미터 지원.
  - 결과에 `index`(1=HEAD, N=HEAD~(N-1)), `hash`, `shortHash`, `message`, `authorName`, `authorEmail`, `authorDate` 포함.
  - VS Code built-in `vscode.git` Extension API(`repository.log()`) 사용.
- **FileDiffHandler** (`/app/vscode/history/diff`): 파일의 두 시점 간 unified diff 추출.
  - **Index 방식**: `fromIndex`/`toIndex` (0=working tree, 1=HEAD, N=HEAD~(N-1)).
  - **Ref 방식**: `fromRef`/`toRef` (커밋 해시, 브랜치명 등).
  - `fromIndex=0`(working tree) ↔ `toIndex=1`(HEAD): `repository.diffWithHEAD()` 사용.
  - 양쪽 모두 커밋 시: `repository.diffBetween()` 사용.
  - v0.1.4 제약: `fromIndex=0`은 `toIndex=1`만 지원.
- **FileSearchHandler** (`/app/vscode/fs/findFiles`): 파일명 키워드로 워크스페이스 파일 검색.
  - `query` 키워드 → `**/*query*` glob 패턴 변환.
  - `include` glob 지정 시 query가 파일명 부분에 삽입됨 (e.g. `**/*.ts` + `Handler` → `**/*Handler*.ts`).
  - 결과에 `fileName`, `filePath`(절대), `relativePath`(워크스페이스 상대) 포함.
- **Git Extension API 타입 선언** (`src/types/git.d.ts`): `GitExtension`, `GitAPI`, `GitRepository`, `GitCommit`, `LogOptions` 인터페이스 추가.

### Changed
- 프로토콜 버전 v0.1.4로 업데이트.
- `capabilities` 배열에 3개 신규 토픽 추가.

---

## [0.1.3] — 2026-03-02

> **Protocol Version: v0.1.3**

### Added
- **포트 자동 증가**: 포트 충돌(EADDRINUSE) 시 자동으로 다음 포트 시도 (최대 10회). 여러 VS Code 창에서 동시 사용 가능 (7200, 7201, ...).
- **토큰 인증**: `idea.server.authEnabled` (전역, 기본값: `true`), `idea.server.authToken` (워크스페이스) 설정 추가.
  - 인증 활성화 시 UUID v4 토큰 자동 생성, `.vscode/settings.json`에 저장.
  - 핸드셰이크에 `token` 필드 추가 (인증 활성화 시 필수).
  - 핸드셰이크 응답에 `authRequired: boolean` 추가.
  - 새 에러코드: `UNAUTHORIZED`.
- **Settings UI 인증 섹션**: 토큰 인증 토글, 토큰 표시, 복사/재생성 버튼.
- **Token Expose Toggle**: `idea.server.exposeToken` 설정 추가 (기본값: `true`).
  - `true`: 토큰을 Global + `.vscode/settings.json` 모두 저장 (기존 동작 유지).
  - `false`: 토큰을 VS Code User 전역 설정에만 저장, 워크스페이스 파일에서 항목 제거 (보안 강화).
  - Settings UI에 "settings.json에 노출" 체크박스 추가.

### Changed
- 프로토콜 버전 v0.1.3으로 업데이트.

---

## [0.1.2] — 2026-03-02

> **Protocol Version: v0.1.2**

### Added
- **DiagnosticHandler** (`/app/vscode/diag/list`): 파일 진단 정보(오류·경고·정보·힌트) 조회.
  - `filePath`에 단일 문자열 또는 문자열 배열을 전달하여 복수 파일 동시 조회 가능.
  - `severity` 파라미터로 심각도 필터링 지원.
  - 파일을 에디터에 열어(`showTextDocument`) 언어 서버 분석을 유도한 뒤 진단 수집.
- **SymbolHandler** (`/app/vscode/nav/symbols`): 문서 내 심볼(함수·클래스·인터페이스·변수 등) 목록 조회.
  - `DocumentSymbol[]` (계층적) 및 `SymbolInformation[]` (평탄) 두 형식 자동 처리.
  - `query` 파라미터로 이름 부분 일치 필터링 지원.
- **상대 경로 지원**: `filePath` 파라미터에 상대 경로 전달 시 워크스페이스 루트 기준으로 자동 해석.
- **프로젝트 레벨 슬래시 명령어** (`.claude/commands/deploy-package.md`): 기존 VSIX 삭제 후 `vsce package`로 재패키징.

### Fixed
- `filePath` 지정 시 파일이 에디터에서 열리지 않아 진단 결과가 빈 배열로 반환되던 문제. `showTextDocument` 호출로 언어 서버 분석을 명시적으로 트리거하도록 수정.

---

## [0.1.1] — 2026-03-01

### Fixed
- **VSIX packaging bug**: Removed `node_modules/**` from `.vscodeignore`. Without a bundler the `ws` package must be included in the VSIX; its absence prevented extension activation entirely (button unresponsive, WebSocket server never started).
- **DefinitionHandler timeout**: Increased TS language server warm-up wait from 200 ms → 1500 ms so the first `executeDefinitionProvider` call succeeds reliably after workspace indexing.

### Changed
- **Panel auto-open separated from server auto-start**: Added `idea.panel.autoOpen` setting (default `false`) so the UI panel and the WebSocket server can be controlled independently.
- **Activity Bar icon**: Replaced with a 220 V European/Korean plug style icon.
- **Settings tab**: Added *Panel › Auto open on startup* checkbox.

### Test
- `test/suite.js` — added `include: 'src/**/*.ts'` scope to find/replace tests that use patterns which exist as string literals in the test file itself, preventing false positives and unintended file modifications.
- `test/suite.js` — added `requestId` console output (grey) in `req()` / `rawReq()` helpers for correlation with extension logs.

---

## [0.1.0] — 2026-02-28

### Added
- **WebSocket server** (`IdeaServer`) on configurable port (default 7200) with per-connection `ClientSession` state machine.
- **Handshake protocol**: client sends `{ type: 'handshake' }`, server responds with available workspace paths.
- **Handler topics**:
  - `/app/vscode/edit/find` — text/regex search across workspace files (`FindHandler`)
  - `/app/vscode/edit/replace` — text/regex replace with capture-group support (`ReplaceHandler`)
  - `/app/vscode/nav/definition` — go-to-definition with extracted source code (`DefinitionHandler`)
  - `/app/vscode/nav/references` — find all references with optional declaration inclusion (`ReferencesHandler`)
- **IdeaLogger** — EventEmitter-based logger with 500-entry ring buffer.
- **IdeaPanel** — Activity Bar sidebar with *Settings* tab (server toggle, port, protocol docs, auto-open) and *Logs* tab (real-time stream, inline JSON expand/collapse).
- **ProtocolViewer** — on-demand WebviewPanel rendering `docs/IDEA_InputProtocol.md` / `docs/IDEA_OutputProtocol.md`.
- **Status bar item** — shows port + connected client count; click to toggle server.
- Settings: `idea.server.port` (default 7200), `idea.server.autoStart` (default true).

---

[Unreleased]: https://github.com/godstale/IDE-Adapter/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/godstale/IDE-Adapter/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/godstale/IDE-Adapter/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/godstale/IDE-Adapter/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/godstale/IDE-Adapter/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/godstale/IDE-Adapter/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/godstale/IDE-Adapter/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/godstale/IDE-Adapter/releases/tag/v0.1.0
