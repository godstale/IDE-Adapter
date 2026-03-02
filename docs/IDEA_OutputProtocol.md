# IDEA Output Protocol

IDEA Extension이 CLI 앱으로 전송하는 메시지 형식 표준.

| 항목 | 값 |
|------|-----|
| **Protocol Version** | `v0.1.6` |
| **App Version** | `v0.1.6` |
| **최종 수정** | 2026-03-02 |

---

## 1. Handshake 응답

CLI의 Handshake에 대한 응답. 연결 성공 시 서버 정보와 지원 기능 목록을 반환한다.

```json
{
  "type": "handshake",
  "version": "0.1.6",
  "authRequired": true,
  "capabilities": [
    "/app/vscode/edit/find",
    "/app/vscode/edit/replace",
    "/app/vscode/nav/definition",
    "/app/vscode/nav/references",
    "/app/vscode/diag/list",
    "/app/vscode/nav/symbols",
    "/app/vscode/history/list",
    "/app/vscode/history/diff",
    "/app/vscode/history/rollback",
    "/app/vscode/fs/findFiles",
    "/app/vscode/localhistory/list",
    "/app/vscode/localhistory/diff",
    "/app/vscode/localhistory/rollback"
  ],
  "workspaces": [
    "/absolute/path/to/project"
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `type` | `"handshake"` | 고정값 |
| `version` | `string` | Extension 버전 |
| `authRequired` | `boolean` | true이면 이후 요청에 토큰 필요. 핸드셰이크 시 `token` 필드를 포함해야 함 |
| `capabilities` | `string[]` | 현재 지원하는 topic 목록 |
| `workspaces` | `string[]` | VS Code에 현재 열려있는 워크스페이스 경로 목록 |

### 인증 실패 응답

토큰이 없거나 잘못된 경우 서버는 아래 응답을 반환한 후 연결을 닫는다.

```json
{
  "type": "handshake",
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing authentication token"
  }
}
```

---

## 2. 성공 응답 (Success Response)

```json
{
  "topic": "/app/vscode/{category}/{action}",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "result": { ... }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `topic` | `string` | 요청과 동일한 topic |
| `requestId` | `string` | 요청과 동일한 requestId |
| `result` | `object` | 기능별 결과 데이터 (각 기능 섹션 참조) |

---

## 3. 에러 응답 (Error Response)

```json
{
  "topic": "/app/vscode/{category}/{action}",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `topic` | `string` | 요청과 동일한 topic (파싱 실패 시 빈 문자열) |
| `requestId` | `string` | 요청과 동일한 requestId |
| `error.code` | `string` | 에러 코드 (아래 목록 참조) |
| `error.message` | `string` | 에러 상세 설명 |

### 에러 코드

| 코드 | 설명 |
|------|------|
| `PARSE_ERROR` | JSON 파싱 실패 또는 잘못된 메시지 구조 |
| `INVALID_REQUEST` | topic 또는 requestId 누락, 필수 파라미터 누락 |
| `UNKNOWN_TOPIC` | 등록되지 않은 topic |
| `HANDLER_ERROR` | 핸들러 실행 중 내부 오류 |
| `UNAUTHORIZED` | 인증 토큰이 없거나 잘못됨 (핸드셰이크 단계에서만 발생) |

---

## 4. 기능별 결과

### `/app/vscode/edit/find`

```json
{
  "topic": "/app/vscode/edit/find",
  "requestId": "uuid",
  "result": {
    "matches": [
      {
        "filePath": "/absolute/path/to/file.ts",
        "line": 42,
        "character": 10,
        "lineText": "  const result = findSomething();"
      }
    ],
    "totalCount": 1
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `matches` | `array` | 검색 결과 목록 |
| `matches[].filePath` | `string` | 매치된 파일의 절대 경로 |
| `matches[].line` | `number` | 매치된 라인 (0-indexed) |
| `matches[].character` | `number` | 매치 시작 컬럼 (0-indexed) |
| `matches[].lineText` | `string` | 해당 라인 전체 텍스트 |
| `totalCount` | `number` | 전체 매치 수 |

---

### `/app/vscode/edit/replace`

```json
{
  "topic": "/app/vscode/edit/replace",
  "requestId": "uuid",
  "result": {
    "replacedCount": 5,
    "affectedFiles": [
      "/absolute/path/to/file1.ts",
      "/absolute/path/to/file2.ts"
    ]
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `replacedCount` | `number` | 교체된 총 횟수 |
| `affectedFiles` | `string[]` | 변경된 파일 경로 목록 |

---

### `/app/vscode/nav/definition`

```json
{
  "topic": "/app/vscode/nav/definition",
  "requestId": "uuid",
  "result": {
    "locations": [
      {
        "filePath": "/absolute/path/to/definition.ts",
        "line": 10,
        "character": 0,
        "endLine": 25,
        "endCharacter": 1,
        "code": "export function myFunction(arg: string): void {\n  // ...\n}"
      }
    ]
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `locations` | `array` | 정의 위치 목록 (보통 1개) |
| `locations[].filePath` | `string` | 파일 절대 경로 |
| `locations[].line` | `number` | 시작 라인 (0-indexed) |
| `locations[].character` | `number` | 시작 컬럼 (0-indexed) |
| `locations[].endLine` | `number` | 끝 라인 (0-indexed) |
| `locations[].endCharacter` | `number` | 끝 컬럼 (0-indexed) |
| `locations[].code` | `string` | 정의 범위의 소스 코드 전체 |

---

### `/app/vscode/nav/references`

```json
{
  "topic": "/app/vscode/nav/references",
  "requestId": "uuid",
  "result": {
    "locations": [
      {
        "filePath": "/absolute/path/to/usage.ts",
        "line": 55,
        "character": 4,
        "endLine": 55,
        "endCharacter": 20
      }
    ],
    "totalCount": 1
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `locations` | `array` | 참조 위치 목록 |
| `locations[].filePath` | `string` | 파일 절대 경로 |
| `locations[].line` | `number` | 참조 라인 (0-indexed) |
| `locations[].character` | `number` | 참조 시작 컬럼 (0-indexed) |
| `locations[].endLine` | `number` | 참조 끝 라인 (0-indexed) |
| `locations[].endCharacter` | `number` | 참조 끝 컬럼 (0-indexed) |
| `totalCount` | `number` | 전체 참조 수 |

---

### `/app/vscode/diag/list`

```json
{
  "topic": "/app/vscode/diag/list",
  "requestId": "uuid",
  "result": {
    "diagnostics": [
      {
        "filePath": "/absolute/path/to/file.ts",
        "line": 10,
        "character": 4,
        "endLine": 10,
        "endCharacter": 20,
        "severity": "error",
        "message": "Type 'string' is not assignable to type 'number'.",
        "source": "ts",
        "code": "2322"
      }
    ],
    "totalCount": 1
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `diagnostics` | `array` | 진단 항목 목록 |
| `diagnostics[].filePath` | `string` | 진단 발생 파일 절대 경로 |
| `diagnostics[].line` | `number` | 시작 라인 (0-indexed) |
| `diagnostics[].character` | `number` | 시작 컬럼 (0-indexed) |
| `diagnostics[].endLine` | `number` | 끝 라인 (0-indexed) |
| `diagnostics[].endCharacter` | `number` | 끝 컬럼 (0-indexed) |
| `diagnostics[].severity` | `string` | `"error"` \| `"warning"` \| `"information"` \| `"hint"` |
| `diagnostics[].message` | `string` | 진단 메시지 |
| `diagnostics[].source` | `string \| null` | 진단 소스 (예: `"ts"`, `"eslint"`) |
| `diagnostics[].code` | `string \| null` | 진단 코드 (예: `"2322"`) |
| `totalCount` | `number` | 전체 진단 수 |

---

### `/app/vscode/nav/symbols`

```json
{
  "topic": "/app/vscode/nav/symbols",
  "requestId": "uuid",
  "result": {
    "symbols": [
      {
        "name": "IHandler",
        "kind": "interface",
        "line": 4,
        "character": 0,
        "endLine": 6,
        "endCharacter": 1,
        "selectionLine": 4,
        "selectionCharacter": 17,
        "containerName": null
      }
    ],
    "totalCount": 1
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `symbols` | `array` | 심볼 항목 목록 |
| `symbols[].name` | `string` | 심볼 이름 |
| `symbols[].kind` | `string` | 심볼 종류 (예: `"class"`, `"interface"`, `"function"`, `"variable"`) |
| `symbols[].line` | `number` | 심볼 범위 시작 라인 (0-indexed) |
| `symbols[].character` | `number` | 심볼 범위 시작 컬럼 (0-indexed) |
| `symbols[].endLine` | `number` | 심볼 범위 끝 라인 (0-indexed) |
| `symbols[].endCharacter` | `number` | 심볼 범위 끝 컬럼 (0-indexed) |
| `symbols[].selectionLine` | `number` | 심볼 이름 선택 범위 라인 (0-indexed) |
| `symbols[].selectionCharacter` | `number` | 심볼 이름 선택 범위 컬럼 (0-indexed) |
| `symbols[].containerName` | `string \| null` | 부모 심볼 이름 (중첩 심볼). 최상위면 `null` |
| `totalCount` | `number` | 전체 심볼 수 |

---

### `/app/vscode/history/list`

```json
{
  "topic": "/app/vscode/history/list",
  "requestId": "uuid",
  "result": {
    "entries": [
      {
        "index": 1,
        "hash": "abc1234def5678901234567890abcdef12345678",
        "shortHash": "abc1234",
        "message": "feat: add FileHistoryHandler",
        "authorName": "godstale",
        "authorEmail": "user@example.com",
        "authorDate": "2026-03-02T10:00:00.000Z"
      }
    ],
    "totalCount": 1
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `entries` | `array` | 커밋 이력 목록 (최신 순) |
| `entries[].index` | `number` | 1=HEAD, 2=HEAD~1, … (diff 요청 시 toIndex/fromIndex 에 사용) |
| `entries[].hash` | `string` | 전체 커밋 해시 (40자) |
| `entries[].shortHash` | `string` | 단축 해시 (7자) |
| `entries[].message` | `string` | 커밋 메시지 |
| `entries[].authorName` | `string \| null` | 커밋 작성자 이름 |
| `entries[].authorEmail` | `string \| null` | 커밋 작성자 이메일 |
| `entries[].authorDate` | `string \| null` | 커밋 날짜 (ISO 8601) |
| `totalCount` | `number` | 반환된 커밋 수 |

---

### `/app/vscode/history/diff`

```json
{
  "topic": "/app/vscode/history/diff",
  "requestId": "uuid",
  "result": {
    "diff": "--- a/src/extension.ts\n+++ b/src/extension.ts\n@@ -1,5 +1,6 @@\n ...",
    "fromRef": "working-tree",
    "toRef": "HEAD"
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `diff` | `string` | unified diff 텍스트. 변경 없으면 빈 문자열 |
| `fromRef` | `string` | 실제 사용된 from ref (`"working-tree"` = index 0) |
| `toRef` | `string` | 실제 사용된 to ref |

---

### `/app/vscode/history/rollback`

```json
{
  "topic": "/app/vscode/history/rollback",
  "requestId": "uuid",
  "result": {
    "filePath": "/abs/path/src/extension.ts",
    "toRef": "HEAD~1",
    "restoredIndex": 2
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `filePath` | `string` | 복원된 파일의 절대 경로 |
| `toRef` | `string` | 복원에 사용된 git ref (예: `"HEAD"`, `"HEAD~1"`) |
| `restoredIndex` | `number` | 복원에 사용된 인덱스 (요청의 `toIndex`와 동일) |

---

### `/app/vscode/fs/findFiles`

```json
{
  "topic": "/app/vscode/fs/findFiles",
  "requestId": "uuid",
  "result": {
    "files": [
      {
        "fileName": "FileHistoryHandler.ts",
        "filePath": "/abs/path/src/handlers/FileHistoryHandler.ts",
        "relativePath": "src/handlers/FileHistoryHandler.ts"
      }
    ],
    "totalCount": 1
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `files` | `array` | 검색된 파일 목록 |
| `files[].fileName` | `string` | 파일명 (확장자 포함) |
| `files[].filePath` | `string` | 파일 절대 경로 |
| `files[].relativePath` | `string` | 워크스페이스 루트 기준 상대경로 |
| `totalCount` | `number` | 검색된 파일 수 |

---

## 5. Local History 결과

### `/app/vscode/localhistory/list`

```json
{
  "topic": "/app/vscode/localhistory/list",
  "requestId": "uuid",
  "result": {
    "entries": [
      {
        "id": "IOCb.ts",
        "timestamp": 1724587051951,
        "timestampLabel": "2024-08-25 10:17:31",
        "source": "Workspace Edit"
      }
    ],
    "totalCount": 1
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `entries` | `array` | 로컬 저장 이력 목록 (최신 순) |
| `entries[].id` | `string` | 저장 파일 ID (예: `"IOCb.ts"`). diff/rollback 요청 시 사용 |
| `entries[].timestamp` | `number` | 저장 시각 (밀리초 epoch) |
| `entries[].timestampLabel` | `string` | 저장 시각 (사람이 읽기 좋은 형식, 예: `"2024-08-25 10:17:31"`) |
| `entries[].source` | `string \| undefined` | 저장 트리거 (예: `"Workspace Edit"`, undefined이면 일반 저장) |
| `totalCount` | `number` | 이력 개수 (이력 없으면 0) |

---

### `/app/vscode/localhistory/diff`

```json
{
  "topic": "/app/vscode/localhistory/diff",
  "requestId": "uuid",
  "result": {
    "diff": "--- 2024-08-24 09:00:00\n+++ 2024-08-25 10:17:31\n@@ -1,5 +1,6 @@\n ...",
    "fromLabel": "2024-08-24 09:00:00",
    "toLabel": "2024-08-25 10:17:31"
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `diff` | `string` | unified diff 텍스트. 변경 없으면 빈 문자열 |
| `fromLabel` | `string` | 비교 시작 시각 레이블 (`"current"` 또는 타임스탬프 문자열) |
| `toLabel` | `string` | 비교 끝 시각 레이블 (`"current"` 또는 타임스탬프 문자열) |

---

### `/app/vscode/localhistory/rollback`

```json
{
  "topic": "/app/vscode/localhistory/rollback",
  "requestId": "uuid",
  "result": {
    "filePath": "/abs/path/src/extension.ts",
    "restoredId": "BfNB.ts",
    "restoredLabel": "2024-08-24 09:00:00"
  }
}
```

| 결과 필드 | 타입 | 설명 |
|---------|------|------|
| `filePath` | `string` | 복원된 파일의 절대 경로 |
| `restoredId` | `string` | 복원에 사용된 저장 ID |
| `restoredLabel` | `string` | 복원 시점 타임스탬프 레이블 |
