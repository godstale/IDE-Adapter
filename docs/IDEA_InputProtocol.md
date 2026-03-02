# IDEA Input Protocol

CLI 앱에서 IDEA Extension으로 전송하는 메시지 형식 표준.

| 항목 | 값 |
|------|-----|
| **Protocol Version** | `v0.1.6` |
| **App Version** | `v0.1.6` |
| **최종 수정** | 2026-03-02 |

---

## 1. Handshake (연결 직후 1회)

WebSocket 연결 직후 CLI가 반드시 먼저 전송해야 한다.
서버는 현재 VS Code에 열려있는 워크스페이스 목록을 응답으로 돌려준다.
클라이언트는 응답에서 사용 가능한 워크스페이스를 확인하고 계속 진행할지 결정한다.

서버에서 `authRequired: true`로 응답한 경우, 이후 요청은 토큰 없이 거부된다.
따라서 `.vscode/settings.json`의 `idea.server.authToken` 값을 핸드셰이크 시 포함해야 한다.

```json
{
  "type": "handshake",
  "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `type` | `"handshake"` | 고정값 |
| `token` | `string` | 인증 토큰. 서버의 `authRequired`가 true일 때 필수. `.vscode/settings.json`의 `idea.server.authToken` 값 |

---

## 2. 일반 요청 (Request)

Handshake 완료 후 기능 호출 시 사용.

```json
{
  "topic": "/app/vscode/{category}/{action}",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "params": { ... }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `topic` | `string` | 호출할 기능 식별자 (토픽) |
| `requestId` | `string` | 요청 추적을 위한 UUID v4. 응답에 동일하게 포함된다 |
| `params` | `object` | 기능별 파라미터 (각 기능 섹션 참조) |

### Topic 네임스페이스

```
/app/vscode/edit/find       - 문자열 검색
/app/vscode/edit/replace    - 문자열 교체
/app/vscode/nav/definition  - 정의 검색
/app/vscode/nav/references  - 참조 검색
/app/vscode/diag/list       - 진단(오류·경고) 조회
/app/vscode/nav/symbols     - 문서 내 심볼 목록
/app/vscode/history/list          - 파일 git 수정 이력 목록
/app/vscode/history/diff          - 두 시점 간 unified diff
/app/vscode/history/rollback      - 파일을 특정 커밋 시점으로 복원
/app/vscode/fs/findFiles          - 파일명 키워드 검색
/app/vscode/localhistory/list     - VS Code 로컬 저장 이력 목록
/app/vscode/localhistory/diff     - 두 로컬 저장 시점 간 unified diff
/app/vscode/localhistory/rollback - 파일을 특정 로컬 저장 시점으로 복원
```

---

## 3. 기능별 파라미터

### `/app/vscode/edit/find`

> 특정 파일 또는 폴더 내에서 문자열을 검색한다.

```json
{
  "topic": "/app/vscode/edit/find",
  "requestId": "uuid",
  "params": {
    "pattern": "searchText",
    "include": "**/*.ts",
    "exclude": "**/node_modules/**",
    "isRegex": false,
    "isCaseSensitive": false
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `pattern` | `string` | ✅ | 검색할 문자열 또는 정규식 |
| `include` | `string` | | 검색 대상 glob 패턴 (기본: `**/*`) |
| `exclude` | `string` | | 제외 glob 패턴 |
| `isRegex` | `boolean` | | 정규식 사용 여부 (기본: `false`) |
| `isCaseSensitive` | `boolean` | | 대소문자 구분 (기본: `false`) |

---

### `/app/vscode/edit/replace`

> 특정 파일 또는 폴더 내에서 문자열을 교체한다.

```json
{
  "topic": "/app/vscode/edit/replace",
  "requestId": "uuid",
  "params": {
    "pattern": "oldText",
    "replacement": "newText",
    "include": "**/*.ts",
    "exclude": "**/node_modules/**",
    "isRegex": false,
    "isCaseSensitive": false
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `pattern` | `string` | ✅ | 교체할 문자열 또는 정규식 |
| `replacement` | `string` | ✅ | 교체할 내용 |
| `include` | `string` | | 대상 glob 패턴 |
| `exclude` | `string` | | 제외 glob 패턴 |
| `isRegex` | `boolean` | | 정규식 사용 여부 |
| `isCaseSensitive` | `boolean` | | 대소문자 구분 |

---

### `/app/vscode/nav/definition`

> 심볼(함수, 변수, 클래스 등)의 정의 위치를 반환한다.

```json
{
  "topic": "/app/vscode/nav/definition",
  "requestId": "uuid",
  "params": {
    "filePath": "/absolute/path/to/file.ts",
    "line": 42,
    "character": 10
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 검색 시작 파일의 절대 경로 |
| `line` | `number` | ✅ | 커서 라인 (0-indexed) |
| `character` | `number` | ✅ | 커서 컬럼 (0-indexed) |

---

### `/app/vscode/nav/references`

> 심볼의 모든 참조 위치를 반환한다.

```json
{
  "topic": "/app/vscode/nav/references",
  "requestId": "uuid",
  "params": {
    "filePath": "/absolute/path/to/file.ts",
    "line": 42,
    "character": 10,
    "includeDeclaration": true
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 검색 시작 파일의 절대 경로 |
| `line` | `number` | ✅ | 커서 라인 (0-indexed) |
| `character` | `number` | ✅ | 커서 컬럼 (0-indexed) |
| `includeDeclaration` | `boolean` | | 선언부 포함 여부 (기본: `true`) |

---

### `/app/vscode/diag/list`

> 파일 또는 VS Code가 이미 분석한 워크스페이스 전체의 진단 정보(오류·경고·정보·힌트)를 반환한다.
>
> **동작 방식**
> - `filePath` 지정: 파일을 에디터에서 열어 언어 서버가 분석하게 한 뒤 진단 반환 (약 1.5~2초 소요)
> - `filePath` 생략: VS Code가 현재까지 분석한 파일들의 진단만 반환 (에디터에서 한 번도 열지 않은 파일은 포함되지 않음)

**단일 파일:**
```json
{
  "topic": "/app/vscode/diag/list",
  "requestId": "uuid",
  "params": {
    "filePath": "src/handlers/Foo.ts",
    "severity": "error"
  }
}
```

**복수 파일 (배열):**
```json
{
  "topic": "/app/vscode/diag/list",
  "requestId": "uuid",
  "params": {
    "filePath": ["src/handlers/Foo.ts", "src/handlers/Bar.ts"],
    "severity": "all"
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string \| string[]` | | 진단할 파일 경로 (절대 또는 상대). 배열로 복수 지정 가능. 생략 시 현재 알려진 전체 진단 반환 |
| `severity` | `string` | | `"error"` \| `"warning"` \| `"information"` \| `"hint"` \| `"all"` (기본: `"all"`) |

---

### `/app/vscode/nav/symbols`

> 문서 내 심볼(함수·클래스·인터페이스·변수 등) 목록을 반환한다.

```json
{
  "topic": "/app/vscode/nav/symbols",
  "requestId": "uuid",
  "params": {
    "filePath": "/absolute/path/to/file.ts",
    "query": "IHandler"
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 심볼을 조회할 파일의 절대 경로 |
| `query` | `string` | | 심볼 이름 부분 일치 필터 (대소문자 무시). 생략 시 전체 반환 |

---

### `/app/vscode/history/list`

> 특정 파일의 git 커밋 이력 목록을 반환한다.

```json
{
  "topic": "/app/vscode/history/list",
  "requestId": "uuid",
  "params": {
    "filePath": "src/extension.ts",
    "maxCount": 20
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 이력 조회할 파일 경로 (절대 또는 워크스페이스 상대경로) |
| `maxCount` | `number` | | 최대 반환 커밋 수 (기본: `20`) |

---

### `/app/vscode/history/diff`

> 파일의 두 시점 간 unified diff를 반환한다. Index 방식 또는 Ref 방식 중 하나를 선택한다.
>
> **Index 기준**: `0` = 현재 working tree, `1` = HEAD, `2` = HEAD~1, `N` = HEAD~(N-1)
>
> **v0.1.4 제약**: `fromIndex=0` 은 `toIndex=1` (HEAD) 만 지원한다.

**Index 방식 (권장):**
```json
{
  "topic": "/app/vscode/history/diff",
  "requestId": "uuid",
  "params": {
    "filePath": "src/extension.ts",
    "fromIndex": 0,
    "toIndex": 1
  }
}
```

**Ref 방식:**
```json
{
  "topic": "/app/vscode/history/diff",
  "requestId": "uuid",
  "params": {
    "filePath": "src/extension.ts",
    "fromRef": "abc1234",
    "toRef": "def5678"
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 비교할 파일 경로 |
| `fromIndex` | `number` | 조건부 | 비교 시작 시점 인덱스 (0=working tree, 1=HEAD, N=HEAD~(N-1)) |
| `toIndex` | `number` | 조건부 | 비교 끝 시점 인덱스 |
| `fromRef` | `string` | 조건부 | git ref (커밋 해시, 브랜치명 등) |
| `toRef` | `string` | 조건부 | git ref |

> Index 방식과 Ref 방식 중 하나를 사용. Index 방식이 지정되면 우선 적용됨. 둘 다 생략 시 working tree(0) vs HEAD(1) 로 동작.

---

### `/app/vscode/history/rollback`

> 파일을 특정 커밋 인덱스 시점의 내용으로 복원하고 디스크에 저장한다.
>
> **Index 기준**: `1` = HEAD, `2` = HEAD~1, `N` = HEAD~(N-1)

```json
{
  "topic": "/app/vscode/history/rollback",
  "requestId": "uuid",
  "params": {
    "filePath": "src/extension.ts",
    "toIndex": 2
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 복원할 파일 경로 (절대 또는 워크스페이스 상대경로) |
| `toIndex` | `number` | ✅ | 복원 대상 인덱스 (1=HEAD, 2=HEAD~1, N=HEAD~(N-1)). 반드시 ≥ 1 |

---

### `/app/vscode/fs/findFiles`

> 파일명 키워드로 워크스페이스 내 파일을 검색한다.

```json
{
  "topic": "/app/vscode/fs/findFiles",
  "requestId": "uuid",
  "params": {
    "query": "Handler",
    "include": "**/*.ts",
    "exclude": "**/node_modules/**",
    "maxResults": 100
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `query` | `string` | ✅ | 파일명에 포함될 키워드 (대소문자 무시) |
| `include` | `string` | | 검색 대상 glob 패턴. query가 파일명 부분에 삽입됨 (기본: `**/*`) |
| `exclude` | `string` | | 제외 glob 패턴 |
| `maxResults` | `number` | | 최대 결과 수 (기본: `100`) |

---

## 4. Local History 토픽 (로컬 저장 이력)

> VS Code가 파일 저장 시마다 자동으로 쌓는 로컬 스냅샷에 접근한다.
> 저장 위치: `{AppData}/Code/User/History/` (VS Code) 또는 `{AppData}/Cursor/User/History/` (Cursor).
> git과 무관하므로 git 미사용 파일이나 커밋 사이 작업 내역 추적에 유용하다.

### `/app/vscode/localhistory/list`

> 특정 파일의 VS Code 로컬 저장 이력 목록을 반환한다.

```json
{
  "topic": "/app/vscode/localhistory/list",
  "requestId": "uuid",
  "params": {
    "filePath": "src/extension.ts"
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 이력 조회할 파일 경로 (절대 또는 워크스페이스 상대경로) |

> 이력이 없으면 에러 없이 빈 배열 반환.

---

### `/app/vscode/localhistory/diff`

> 두 로컬 저장 시점 간 unified diff를 반환한다.

```json
{
  "topic": "/app/vscode/localhistory/diff",
  "requestId": "uuid",
  "params": {
    "filePath": "src/extension.ts",
    "fromId": "BfNB.ts",
    "toId": "IOCb.ts"
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 비교할 파일 경로 |
| `fromId` | `string` | 조건부 | 비교 시작 저장 ID (`list` 결과의 `id` 값). 생략 시 현재 파일 내용 사용 |
| `toId` | `string` | 조건부 | 비교 끝 저장 ID. 생략 시 현재 파일 내용 사용 |

> `fromId`와 `toId` 동시 생략 → `INVALID_REQUEST`.
> 존재하지 않는 ID → `INVALID_REQUEST`.

---

### `/app/vscode/localhistory/rollback`

> 파일을 특정 로컬 저장 시점의 내용으로 복원하고 디스크에 저장한다.

```json
{
  "topic": "/app/vscode/localhistory/rollback",
  "requestId": "uuid",
  "params": {
    "filePath": "src/extension.ts",
    "toId": "BfNB.ts"
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `filePath` | `string` | ✅ | 복원할 파일 경로 |
| `toId` | `string` | ✅ | 복원 대상 저장 ID (`list` 결과의 `id` 값) |
