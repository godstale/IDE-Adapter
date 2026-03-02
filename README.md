# IDEA — Integrated Development Environment Adapter

> Expose VS Code IDE features to external CLI apps and AI agents via a local WebSocket server.

| | |
|---|---|
| **App Version** | `v0.1.6` |
| **Protocol Version** | `v0.1.6` |

**[한국어 README](docs/README_ko.md)**

---

## What is IDEA?

IDEA is a VS Code extension that starts a local WebSocket server (default port **7200**). Any external program — a CLI tool, an AI agent, a script — can connect and use VS Code's built-in language intelligence: find & replace, go-to-definition, references, diagnostics, symbols, git history, and more.

```
External CLI / AI Agent
        │  WebSocket (ws://localhost:7200)
        ▼
  ┌─────────────────────────────┐
  │  IDEA VS Code Extension     │
  │  ├─ Find / Replace          │
  │  ├─ Go to Definition        │
  │  ├─ Find References         │
  │  ├─ Diagnostics             │
  │  ├─ Symbols                 │
  │  ├─ Git History & Diff      │
  │  └─ Local History           │
  └─────────────────────────────┘
```

---

## Installation

### From VSIX (recommended)

1. Download the latest `.vsix` file from [Releases](https://github.com/godstale/IDE-Adapter/releases)
2. In VS Code: **Extensions** → `...` menu → **Install from VSIX...**
3. Select the downloaded file

### Build from source

```bash
git clone https://github.com/godstale/IDE-Adapter.git
cd IDE-Adapter
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

To build a VSIX package:

```bash
npm install -g vsce
vsce package
```

---

## Quick Start

Once installed, the WebSocket server starts automatically on port **7200**.

### 1. Connect and handshake

```bash
# Install wscat if needed
npm install -g wscat

# Connect (with auth token from .vscode/settings.json)
wscat -c ws://localhost:7200
> {"type":"handshake","token":"your-uuid-token"}
< {"type":"handshake","version":"0.1.6","authRequired":true,"capabilities":[...]}
```

### 2. Send a request

```json
{
  "topic": "/app/vscode/edit/find",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "params": {
    "pattern": "IStubService",
    "include": "src/**/*.ts"
  }
}
```

### 3. Receive the result

```json
{
  "topic": "/app/vscode/edit/find",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "result": {
    "matches": [
      { "filePath": "/workspace/src/stub.ts", "line": 2, "lineText": "interface IStubService {" }
    ],
    "totalCount": 1
  }
}
```

> **Multiple VS Code windows**: If you open multiple windows, each window gets its own port (7200, 7201, …). The actual port is saved to `.vscode/settings.json` automatically.

---

## Authentication

When auth is enabled (default), a UUID token is auto-generated and stored in `.vscode/settings.json`:

```json
{
  "idea.server.port": 7200,
  "idea.server.authToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Include the token in every handshake message. You can manage the token from the IDEA sidebar panel.

---

## Supported Topics

| Topic | Description |
|-------|-------------|
| `/app/vscode/edit/find` | Search for text or regex in files |
| `/app/vscode/edit/replace` | Replace text in files |
| `/app/vscode/nav/definition` | Go to symbol definition |
| `/app/vscode/nav/references` | Find all references to a symbol |
| `/app/vscode/diag/list` | List diagnostics (errors / warnings) |
| `/app/vscode/nav/symbols` | List symbols in a file |
| `/app/vscode/history/list` | List git commit history for a file |
| `/app/vscode/history/diff` | Unified diff between two git commits |
| `/app/vscode/history/rollback` | Restore a file to a specific commit |
| `/app/vscode/fs/findFiles` | Search files by filename keyword |
| `/app/vscode/localhistory/list` | List VS Code local save history entries |
| `/app/vscode/localhistory/diff` | Diff between two local history saves |
| `/app/vscode/localhistory/rollback` | Restore a file to a local history save |

Full message format: [`docs/IDEA_InputProtocol.md`](docs/IDEA_InputProtocol.md) · [`docs/IDEA_OutputProtocol.md`](docs/IDEA_OutputProtocol.md)

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `idea.server.port` | `7200` | Base port (auto-increments on conflict) |
| `idea.server.autoStart` | `true` | Start server when VS Code opens |
| `idea.server.authEnabled` | `true` | Enable token authentication |
| `idea.server.authToken` | `""` | Auth token (UUID, auto-generated) |
| `idea.server.exposeToken` | `true` | Save token to `.vscode/settings.json` |
| `idea.panel.autoOpen` | `false` | Open IDEA panel on VS Code startup |

---

## Testing

See **[test/HOWTO_TEST.md](test/HOWTO_TEST.md)** for the full test guide.

**Prerequisites**: Launch the Extension Development Host with **F5** in VS Code.

```bash
# Run all automated tests
node test/suite.js

# Quick automated smoke test (no source modification)
node test/test_auto.js

# Interactive CLI tool
node test/test.js find "IStubService" --include=test/src/**/*.ts
node test/test.js sym test/src/App.tsx
node test/test.js history test/src/stub.ts
```

---

## Status Bar

The status bar item (bottom-right) shows server state:

- `$(radio-tower) IDEA :7200 (2)` — running on port 7200, 2 clients connected
- `$(debug-disconnect) IDEA (stopped)` — server not running

Click to toggle the server on/off.

---

## More

- [Protocol specification (Input)](docs/IDEA_InputProtocol.md)
- [Protocol specification (Output)](docs/IDEA_OutputProtocol.md)
- [Changelog](CHANGELOG.md)
- [한국어 README](docs/README_ko.md)
