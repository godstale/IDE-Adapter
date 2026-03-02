
## HOW TO USE test.js / suite.js

### 사전 준비

1. VS Code에서 **F5** 키로 **Extension Development Host** 실행
2. 서버가 시작되면 `.vscode/settings.json`에 포트와 인증 토큰이 자동으로 저장됩니다:
   ```json
   {
     "idea.server.port": 7200,
     "idea.server.authToken": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   }
   ```
3. `test/` 폴더에 `node_modules/ws`가 있어야 합니다:
   ```
   npm install
   ```

> **포트와 토큰은 자동 감지됩니다.** 별도 인수 없이 실행해도 `.vscode/settings.json`을 읽어 접속합니다.

---

### test.js — 대화형 CLI 도구

| 기능 | 동작 |
|------|------|
| `find <pattern>` | WebSocket 연결 → find 요청 → file:line + lineText 목록 출력 |
| `replace <pat> <rep>` | replace 요청 → 교체 횟수 + 영향 파일 목록 출력 |
| `def <symbol>` | find → 번호 선택 → definition 코드 블록 출력 |
| `ref <symbol>` | find → 번호 선택 → references 위치 목록 출력 |
| `diag [filePath...]` | 진단(오류·경고) 목록 출력 |
| `sym <filePath>` | 파일 내 심볼 목록 출력 |

#### 실행 예시

```bash
# test/src/stub.ts에서 IStubService 검색
node test/test.js find "IStubService" --include=test/src/**/*.ts

# stub.ts 파일 심볼 목록
node test/test.js sym test/src/App.tsx

# stub.ts 파일 진단 (오류/경고)
node test/test.js diag test/src/App.tsx

# stub.ts에서 IStubService 정의로 이동 (대화형 선택)
node test/test.js def "IStubService" --include=test/src/**/*.ts

# stub.ts에서 IStubService 참조 목록 (대화형 선택)
node test/test.js ref "IStubService" --include=test/src/**/*.ts

# 포트 직접 지정 (settings.json 오버라이드)
node test/test.js find "IStubService" --port=7201 --include=test/src/**/*.ts
```

#### 옵션

```
--include=<glob>      파일 필터
--exclude=<glob>      제외 패턴
--regex               정규식 모드
--case                대소문자 구분
--severity=<level>    diag 전용: error|warning|information|hint|all (기본: all)
--query=<name>        sym 전용: 심볼 이름 부분 일치 필터 (대소문자 무시)
--port=<n>            WebSocket 포트 (기본: .vscode/settings.json → 7200)
--help                도움말
```

---

### suite.js — 자동화 전체 테스트

모든 핸들러의 파라미터·응답 구조·에러 케이스를 자동으로 검증합니다.

```bash
# 기본 실행 (포트/토큰 자동 감지)
node test/suite.js

# 포트 직접 지정
node test/suite.js 7201
```

**테스트 대상 파일**: `test/src/stub.ts`

네비게이션 테스트(`find`, `definition`, `references`, `symbols`)는 모두 `test/src/stub.ts`를 사용합니다.
이 파일은 고정된 심볼 위치를 가지고 있으므로 어떤 워크스페이스에서도 동일하게 동작합니다.

```
stub.ts 심볼 위치 (0-indexed):
  Line  2, char 17 → IStubService 인터페이스
  Line  7, char 13 → StubServiceError 클래스
  Line 11, char 13 → StubServiceImpl 클래스
  Line 21, char 16 → createStubService 함수
```

---

### test/ 폴더 복사해서 다른 워크스페이스에서 사용하기

1. `test/` 폴더 전체를 타겟 워크스페이스에 복사
2. `test/` 폴더 안에서 `npm install` 실행 (또는 워크스페이스 루트에서 `npm install`)
3. VS Code에서 해당 워크스페이스를 열고 **F5** 실행
4. `.vscode/settings.json`이 자동 생성되면 아래 명령어로 테스트:

```bash
node test/suite.js
node test/test.js sym test/src/stub.ts
```
