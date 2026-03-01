# IDEA Output Protocol

IDEA Extension이 CLI 앱으로 전송하는 메시지 형식 표준.

| 항목 | 값 |
|------|-----|
| **Protocol Version** | `v0.1.2` |
| **App Version** | `v0.1.2` |
| **최종 수정** | 2026-03-02 |

---

## 1. Handshake 응답

CLI의 Handshake에 대한 응답. 연결 성공 시 서버 정보와 지원 기능 목록을 반환한다.

```json
{
  "type": "handshake",
  "version": "0.1.2",
  "capabilities": [
    "/app/vscode/edit/find",
    "/app/vscode/edit/replace",
    "/app/vscode/nav/definition",
    "/app/vscode/nav/references",
    "/app/vscode/diag/list",
    "/app/vscode/nav/symbols"
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
| `capabilities` | `string[]` | 현재 지원하는 topic 목록 |
| `workspaces` | `string[]` | VS Code에 현재 열려있는 워크스페이스 경로 목록 |

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
