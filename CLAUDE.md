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

## Project Management Convention

- When implementing a new feature, update TODO lists before writing code; move completed items to a history file.
- Protocol input/output formats must be kept in sync with `docs/IDEA_InputProtocol.md` / `docs/IDEA_OutputProtocol.md`.
- User-visible changes go in `README.md`.
- Always make TODO list first before writing code.
- Make TODO lists in `docs/TODO.md` and move completed items to `docs/TODO_History.md`.
- Use memory to keep track of project history.
- Use hooks to notify me with alarm sound when a new feature is implemented.