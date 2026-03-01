# IDEA — Integrated Development Environment Adapter

VS Code Extension that exposes IDE features (find, replace, go-to-definition, references, diagnostics, symbols) to external CLI applications via a local WebSocket server.

| | |
|---|---|
| **App Version** | `v0.1.2` |
| **Protocol Version** | `v0.1.2` |

## Quick Start

1. Install the extension in VS Code / Cursor
2. The WebSocket server starts automatically on port **7200**
3. Connect your CLI app and perform a handshake:

```bash
# Using wscat
wscat -c ws://localhost:7200
> {"type":"handshake","workspacePath":"/path/to/project"}
< {"type":"handshake","version":"0.1.2","capabilities":[...]}
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `idea.server.port` | `7200` | WebSocket server port |
| `idea.server.autoStart` | `true` | Start server when VS Code opens |
| `idea.panel.autoOpen` | `false` | Open IDEA Adapter panel when VS Code opens |

## Status Bar

The status bar item (bottom-right) shows:
- `$(radio-tower) IDEA :7200 (2)` — running on port 7200 with 2 clients
- `$(debug-disconnect) IDEA (stopped)` — server not running

Click it to toggle the server on/off.

## Protocol

See [`docs/IDEA_InputProtocol.md`](docs/IDEA_InputProtocol.md) and [`docs/IDEA_OutputProtocol.md`](docs/IDEA_OutputProtocol.md) for the full message format specification.

## Supported Topics

| Topic | Description |
|-------|-------------|
| `/app/vscode/edit/find` | Search for text in files |
| `/app/vscode/edit/replace` | Replace text in files |
| `/app/vscode/nav/definition` | Go to symbol definition |
| `/app/vscode/nav/references` | Find all references |
| `/app/vscode/diag/list` | List diagnostics (errors/warnings) for a file or workspace |
| `/app/vscode/nav/symbols` | List symbols (functions, classes, interfaces, etc.) in a file |

## Development

```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## VSIX 패키지 생성 방법

- 패키지 설치를 위해 vsce 설치
```
  brew install node    # mac
  npm install -g vsce  # windows
```

- 프로젝트 root 폴더 안에서 패키징 명령어 실행
```
  vsce package
```

- 생성된 VSIX 패키징 파일을 VS Code > Extensions > ... > Install from VSIX... 실행 후 패키지 파일 선택
