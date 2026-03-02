# IDEA — Integrated Development Environment Adapter

> VS Code의 IDE 기능을 외부 CLI 앱과 AI 에이전트에 로컬 WebSocket 서버로 노출합니다.

| | |
|---|---|
| **앱 버전** | `v0.1.6` |
| **프로토콜 버전** | `v0.1.6` |

**[English README](../README.md)**

---

## IDEA란?

IDEA는 VS Code 확장 프로그램으로, 로컬 WebSocket 서버(기본 포트 **7200**)를 실행합니다. 외부 CLI 도구, AI 에이전트, 스크립트 등 어떤 프로그램도 접속하여 VS Code의 언어 인텔리전스(검색·교체·정의 이동·참조 찾기·진단·심볼·git 이력 등)를 활용할 수 있습니다.

```
외부 CLI / AI 에이전트
        │  WebSocket (ws://localhost:7200)
        ▼
  ┌─────────────────────────────┐
  │  IDEA VS Code Extension     │
  │  ├─ 텍스트 검색 / 교체      │
  │  ├─ 정의 이동               │
  │  ├─ 참조 찾기               │
  │  ├─ 진단 (오류/경고)        │
  │  ├─ 심볼 목록               │
  │  ├─ Git 이력 & Diff         │
  │  └─ 로컬 저장 이력          │
  └─────────────────────────────┘
```

---

## 설치

### VSIX 파일로 설치 (권장)

1. [Releases](https://github.com/godstale/IDE-Adapter/releases) 에서 최신 `.vsix` 파일 다운로드
2. VS Code: **Extensions** → `...` 메뉴 → **Install from VSIX...**
3. 다운로드한 파일 선택

### 소스에서 빌드

```bash
git clone https://github.com/godstale/IDE-Adapter.git
cd IDE-Adapter
npm install
npm run compile
# VS Code에서 F5 키로 Extension Development Host 실행
```

VSIX 패키지 직접 빌드:

```bash
npm install -g vsce
vsce package
```

---

## 빠른 시작

설치 후 WebSocket 서버가 포트 **7200**에서 자동으로 시작됩니다.

### 1. 접속 및 핸드셰이크

```bash
# wscat 설치 (없는 경우)
npm install -g wscat

# 접속 (.vscode/settings.json의 인증 토큰 사용)
wscat -c ws://localhost:7200
> {"type":"handshake","token":"your-uuid-token"}
< {"type":"handshake","version":"0.1.6","authRequired":true,"capabilities":[...]}
```

### 2. 요청 전송

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

### 3. 결과 수신

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

> **VS Code 창 여러 개 실행 시**: 각 창의 서버가 7200, 7201, … 순으로 자동 배정됩니다. 실제 포트는 `.vscode/settings.json`에 자동 저장됩니다.

---

## 인증

인증이 활성화(기본값)되면 UUID 토큰이 자동 생성되어 `.vscode/settings.json`에 저장됩니다:

```json
{
  "idea.server.port": 7200,
  "idea.server.authToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

모든 핸드셰이크 메시지에 토큰을 포함해야 합니다. IDEA 사이드바 패널에서 토큰을 관리할 수 있습니다.

---

## 지원 토픽

| 토픽 | 설명 |
|-------|-------------|
| `/app/vscode/edit/find` | 파일에서 텍스트/정규식 검색 |
| `/app/vscode/edit/replace` | 파일에서 텍스트 교체 |
| `/app/vscode/nav/definition` | 심볼 정의로 이동 |
| `/app/vscode/nav/references` | 심볼의 모든 참조 찾기 |
| `/app/vscode/diag/list` | 진단 목록 (오류/경고) 조회 |
| `/app/vscode/nav/symbols` | 파일 내 심볼 목록 조회 |
| `/app/vscode/history/list` | 파일의 git 커밋 이력 목록 |
| `/app/vscode/history/diff` | 두 커밋 간 unified diff |
| `/app/vscode/history/rollback` | 특정 커밋 시점으로 파일 복원 |
| `/app/vscode/fs/findFiles` | 파일명 키워드로 워크스페이스 파일 검색 |
| `/app/vscode/localhistory/list` | VS Code 로컬 저장 이력 목록 |
| `/app/vscode/localhistory/diff` | 두 로컬 저장 시점 간 diff |
| `/app/vscode/localhistory/rollback` | 특정 로컬 저장 시점으로 파일 복원 |

전체 메시지 형식: [`docs/IDEA_InputProtocol.md`](IDEA_InputProtocol.md) · [`docs/IDEA_OutputProtocol.md`](IDEA_OutputProtocol.md)

---

## 설정

| 설정 | 기본값 | 설명 |
|---------|---------|-------------|
| `idea.server.port` | `7200` | 기본 포트 (충돌 시 자동 증가) |
| `idea.server.autoStart` | `true` | VS Code 시작 시 서버 자동 실행 |
| `idea.server.authEnabled` | `true` | 토큰 인증 활성화 |
| `idea.server.authToken` | `""` | 인증 토큰 (UUID, 자동 생성) |
| `idea.server.exposeToken` | `true` | `.vscode/settings.json`에 토큰 저장 |
| `idea.panel.autoOpen` | `false` | VS Code 시작 시 IDEA 패널 자동 열기 |

---

## 테스트

전체 테스트 가이드: **[test/HOWTO_TEST.md](../test/HOWTO_TEST.md)**

**사전 준비**: VS Code에서 **F5**로 Extension Development Host 실행

```bash
# 전체 자동화 테스트 (모든 핸들러 검증)
node test/suite.js

# 빠른 자동 스모크 테스트 (소스 수정 없음)
node test/test_auto.js

# 대화형 CLI 도구
node test/test.js find "IStubService" --include=test/src/**/*.ts
node test/test.js sym test/src/App.tsx
node test/test.js history test/src/stub.ts
```

---

## 상태 표시줄

우측 하단 상태 표시줄이 서버 상태를 보여줍니다:

- `$(radio-tower) IDEA :7200 (2)` — 포트 7200에서 실행 중, 클라이언트 2개 연결
- `$(debug-disconnect) IDEA (stopped)` — 서버 정지 상태

클릭하면 서버를 켜거나 끌 수 있습니다.

---

## 관련 문서

- [프로토콜 명세 (입력)](IDEA_InputProtocol.md)
- [프로토콜 명세 (출력)](IDEA_OutputProtocol.md)
- [변경 이력 (Changelog)](../CHANGELOG.md)
- [English README](../README.md)
