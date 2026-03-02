# HOW TO TEST — IDEA Adapter

## 사전 준비

1. VS Code에서 **F5** 키로 **Extension Development Host** 실행
2. 서버가 시작되면 포트와 인증 토큰이 `.vscode/settings.json`에 자동 저장됩니다:
   ```json
   {
     "idea.server.port": 7200,
     "idea.server.authToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   }
   ```
3. `test/` 폴더에서 `npm install` 실행 (ws 패키지 필요)

> **포트와 토큰은 자동 감지됩니다.** 별도 인수 없이 실행해도 `.vscode/settings.json`을 읽어 접속합니다.

---

## 테스트 파일 구조

```
test/
  suite.js          ← 전체 자동화 테스트 (모든 핸들러 검증)
  test.js           ← 대화형 CLI 도구
  test_auto.js      ← 빠른 자동 스모크 테스트 (소스 수정 없음)
  src/
    stub.ts         ← navigation 테스트 기준 파일 (IStubService 등 고정 심볼)
    App.tsx         ← React 컴포넌트 (diag / sym 테스트)
    ai/
      chatService.ts ← TS 모듈 (getChatResponse, streamChatResponse 심볼)
```

**stub.ts 심볼 위치 (0-indexed):**
```
Line  2, char 17 → IStubService 인터페이스
Line  7, char 13 → StubServiceError 클래스
Line 11, char 13 → StubServiceImpl 클래스
Line 21, char 16 → createStubService 함수
```

---

## suite.js — 전체 자동화 테스트

모든 핸들러의 파라미터·응답 구조·에러 케이스를 자동으로 검증합니다.

```bash
node test/suite.js          # 포트/토큰 자동 감지
node test/suite.js 7201     # 포트 직접 지정
```

| 섹션 | 주요 파일 |
|------|-----------|
| `/app/vscode/edit/find` | test/src/stub.ts |
| `/app/vscode/edit/replace` | test/src/stub.ts |
| `/app/vscode/nav/definition` | test/src/stub.ts |
| `/app/vscode/nav/references` | test/src/stub.ts |
| `/app/vscode/diag/list` | test/src/App.tsx |
| `/app/vscode/nav/symbols` | stub.ts + chatService.ts |
| `/app/vscode/history/list` | test/src/stub.ts |
| `/app/vscode/history/diff` | test/src/stub.ts |
| `/app/vscode/fs/findFiles` | chatService.ts / stub.ts |
| `/app/vscode/history/rollback` | test/src/stub.ts |
| `Protocol — 에러 처리` | — |

---

## test_auto.js — 빠른 스모크 테스트

소스 파일을 수정하지 않는 핵심 커맨드만 자동 실행합니다. 빠르게 기능 동작 여부를 확인할 때 사용합니다.

```bash
node test/test_auto.js
node test/test_auto.js 7201   # 포트 직접 지정
```

실행되는 테스트 항목:
- 텍스트 검색 (`find`)
- 정의 이동 (`def`)
- 진단 조회 (`diag`)
- 심볼 목록 (`sym`)
- git 이력 (`history`)
- git diff (`diff`)
- 파일 검색 (`search`)
- VS Code 로컬 저장 이력 (`lhlist`)

---

## test.js — 대화형 CLI 도구

| 기능 | 동작 |
|------|------|
| `find <pattern>` | 패턴 검색 → file:line + lineText 목록 출력 |
| `def <symbol>` | find → 번호 선택 → definition 코드 블록 출력 |
| `ref <symbol>` | find → 번호 선택 → references 위치 목록 출력 |
| `diag [filePath...]` | 진단(오류·경고) 목록 출력 |
| `sym <filePath>` | 파일 내 심볼 목록 출력 |
| `history <filePath>` | 파일의 git 커밋 이력 목록 출력 |
| `diff <filePath>` | 두 시점 간 unified diff 출력 |
| `search <query>` | 파일명 키워드로 워크스페이스 파일 검색 |
| `rollback <filePath> <toIndex>` | 파일을 특정 커밋으로 복원 (⚠️ 파일 수정됨) |
| `lhlist <filePath>` | VS Code 로컬 저장 이력 목록 출력 |
| `lhdiff <filePath>` | 두 로컬 저장 시점 간 diff 출력 |
| `lhrollback <filePath> <id>` | 특정 로컬 저장 시점으로 복원 (⚠️ 파일 수정됨) |

### 실행 예시

```bash
# 텍스트 검색
node test/test.js find "getChatResponse" --include=test/src/**/*.ts
node test/test.js find "IStubService" --include=test/src/**/*.ts

# 정의 이동 / 참조 목록 (대화형 선택)
node test/test.js def "IStubService" --include=test/src/**/*.ts
node test/test.js ref "IStubService" --include=test/src/**/*.ts

# 파일 진단 (오류/경고)
node test/test.js diag test/src/App.tsx
node test/test.js diag test/src/App.tsx --severity=error

# 파일 심볼 목록
node test/test.js sym test/src/App.tsx
node test/test.js sym test/src/ai/chatService.ts
node test/test.js sym test/src/stub.ts --query=Service

# git 커밋 이력
node test/test.js history test/src/App.tsx
node test/test.js history test/src/stub.ts --max=5

# git diff (두 시점 간)
node test/test.js diff test/src/App.tsx               # working tree vs HEAD
node test/test.js diff test/src/App.tsx --from=1 --to=2   # HEAD vs HEAD~1

# 파일명 키워드 검색
node test/test.js search App.tsx --include=test/src/**
node test/test.js search stub

# VS Code 로컬 저장 이력
node test/test.js lhlist test/src/App.tsx
node test/test.js lhdiff test/src/App.tsx --toId=<id>
node test/test.js lhdiff test/src/App.tsx --fromId=<id1> --toId=<id2>

# 포트 직접 지정
node test/test.js find "IStubService" --port=7201 --include=test/src/**/*.ts
```

### 옵션

```
--include=<glob>      파일 필터
--exclude=<glob>      제외 패턴
--regex               정규식 모드
--case                대소문자 구분
--severity=<level>    diag 전용: error|warning|information|hint|all (기본: all)
--query=<name>        sym 전용: 심볼 이름 부분 일치 필터 (대소문자 무시)
--max=<n>             history 전용: 최대 커밋 수 (기본: 20)
--from=<n>            diff 전용: fromIndex (0=working tree, 1=HEAD, 2=HEAD~1, ...)
--to=<n>              diff 전용: toIndex (1=HEAD, 2=HEAD~1, ...)
--fromId=<id>         lhdiff 전용: from 로컬 히스토리 ID
--toId=<id>           lhdiff 전용: to 로컬 히스토리 ID
--port=<n>            WebSocket 포트 (기본: .vscode/settings.json → 7200)
--help                도움말
```

---

## 다른 워크스페이스에서 사용하기

1. `test/` 폴더 전체를 타겟 워크스페이스에 복사
2. 워크스페이스 루트에서 `npm install` 실행
3. VS Code에서 해당 워크스페이스를 열고 **F5** 실행
4. `.vscode/settings.json`이 자동 생성되면 아래 명령어로 테스트:

```bash
node test/suite.js
node test/test_auto.js
```
