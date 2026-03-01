# Changelog

All notable changes to **IDEA — IDE Adapter** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

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

[Unreleased]: https://github.com/godstale/IDE-Adapter/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/godstale/IDE-Adapter/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/godstale/IDE-Adapter/releases/tag/v0.1.0
