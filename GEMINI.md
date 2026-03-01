# GEMINI.md

This file provides instructional context and an overview of the IDEA (IDE Adapter) project for Gemini interactions.

## Project Overview

**IDEA (Integrated Development Environment Adapter)** is a VS Code Extension that exposes core IDE features to external CLI applications via a local WebSocket server. 

**Main Technologies:**
- TypeScript
- Node.js
- VS Code Extension API
- WebSockets (`ws` package)

**Architecture:**
- **IdeaServer:** A WebSocket server (default port 7200) that accepts connections from external CLI clients.
- **ClientSession:** Manages the per-connection state machine (handshake → request/response loop).
- **HandlerRegistry & Handlers:** Maps protocol topics to specific actions (e.g., `DefinitionHandler`, `FindHandler`, `ReplaceHandler`, `ReferencesHandler`).
- **IdeaPanel & ProtocolViewer:** VS Code Webview providers for a sidebar panel (Settings and Logs) and documentation viewing.
- **Protocol:** Defined in `docs/IDEA_InputProtocol.md` and `docs/IDEA_OutputProtocol.md`. Communication uses JSON payloads over WebSockets.

## Building and Running

**Prerequisites:**
- Node.js
- npm

**Commands:**
- **Install dependencies:** `npm install`
- **Compile (TypeScript build to `out/`):** `npm run compile`
- **Watch mode (Incremental build):** `npm run watch`
- **Lint (ESLint):** `npm run lint`

**Running and Testing:**
- **Launch Extension:** Press **F5** in VS Code to launch the Extension Development Host for manual testing.
- **Test Client:** A test client script is provided to interact with the running extension server.
  ```bash
  node test/client.js          # Connects to default ws://localhost:7200
  node test/client.js 7201     # Connects to a custom port
  ```

## Development Conventions

- **Module System:** The project uses `"module": "Node16"`. All intra-project imports **must** use the `.js` extension (e.g., `import { Foo } from './Foo.js'`).
- **Adding a New Handler:**
  1. Create `src/handlers/<Name>Handler.ts` implementing `IHandler` from `src/protocol/types.ts`.
  2. Register it in `activate()` in `src/extension.ts`: `registry.register('/app/vscode/...', new NameHandler())`.
  3. Document the input and output formats in `docs/IDEA_InputProtocol.md` and `docs/IDEA_OutputProtocol.md`.
- **Protocol Rules:**
  - The **first message** from a client must be a handshake: `{ "type": "handshake", "workspacePath": "..." }`.
  - Subsequent messages are requests: `{ "topic": "...", "requestId": "...", "params": {...} }`.
  - Error codes include: `PARSE_ERROR`, `INVALID_REQUEST`, `UNKNOWN_TOPIC`, `WORKSPACE_NOT_FOUND`, `HANDLER_ERROR`.
- **Project Management:**
  - **TODO Lists:** When implementing new features, create/update TODO lists first (in `docs/TODO.md`) before writing code. Move completed items to a history file (`docs/TODO_History.md`).
  - **Documentation:** Protocol input/output formats must be kept in sync with the respective markdown files in `docs/`. User-visible changes should be added to `README.md`.
