# TODO

## 규칙

- **코딩 시작 전** 이 파일에 구현 계획을 상세히 기록한다.
- 항목 완료 후 `docs/TODO_History.md`로 이동한다.
- 각 항목은 아래 포맷을 따른다:

```markdown
## [기능명] — YYYY-MM-DD

### 목표
간단한 목표 설명

### 구현 계획
- [ ] 세부 작업 1
- [ ] 세부 작업 2
- [ ] 세부 작업 3

### 수정 대상 파일
| 파일 | 작업 |
|------|------|
| `src/handlers/XxxHandler.ts` | 신규 생성 |
| `src/extension.ts` | 핸들러 등록 |
| `docs/IDEA_InputProtocol.md` | 업데이트 |
```


## [멀티 워크스페이스 + 인증/보안] — 2026-03-02

### 목표
여러 VS Code 창(워크스페이스)을 동시에 열었을 때 포트 충돌 없이 각자 독립적으로 동작하고,
UUID 토큰 기반 인증으로 무단 WebSocket 접속을 차단한다.

### 구현 계획

#### Feature 1: 포트 자동 증가 (Multi-workspace)
- [x] `IdeaServer.start(port)` — EADDRINUSE 발생 시 port+1 재시도 (최대 10회)
- [x] `tryBind(port)` private 메서드로 단일 포트 바인딩 시도 로직 분리
- [x] 성공한 실제 포트를 `onStatusChange` 콜백으로 extension.ts에 전달 (기존 메커니즘 활용)

#### Feature 2: 토큰 인증 (Auth/Security)
- [x] `src/protocol/types.ts` — `AuthConfig` 인터페이스 추가, `ClientHandshake.token?`, `ServerHandshake.authRequired` 추가
- [x] `package.json` — `idea.server.authEnabled` (global, default: true), `idea.server.authToken` (workspace, default: "") 설정 추가
- [x] `src/extension.ts` — `getOrCreateAuthConfig()` 헬퍼 (UUID 자동 생성 + workspace 설정 저장), `IdeaServer`/`IdeaPanel`에 AuthConfig 전달
- [x] `src/server/IdeaServer.ts` — 생성자에 `AuthConfig` 추가, `updateAuthConfig()` 메서드 추가, ClientSession에 AuthConfig 전달
- [x] `src/session/ClientSession.ts` — 핸드셰이크에서 token 검증, UNAUTHORIZED 에러 응답, VERSION → '0.1.3'
- [x] `src/panel/IdeaPanel.ts` — Settings탭에 "인증" 섹션 UI 추가 (toggle, token 표시, 복사, 재생성 버튼)

#### 문서/버전 업데이트
- [x] `docs/IDEA_InputProtocol.md` — handshake `token` 필드 추가, 버전 → v0.1.3
- [x] `docs/IDEA_OutputProtocol.md` — handshake `authRequired` 필드, UNAUTHORIZED 에러코드, 버전 → v0.1.3
- [x] `README.md` — 버전 테이블, 신규 설정 항목 추가
- [x] `CHANGELOG.md` — v0.1.3 섹션 추가
- [x] `package.json` — version → "0.1.3"

### 수정 대상 파일
| 파일 | 작업 |
|------|------|
| `src/protocol/types.ts` | AuthConfig 인터페이스 추가, 기존 핸드셰이크 타입 확장 |
| `src/server/IdeaServer.ts` | 포트 자동 증가, AuthConfig 수용 |
| `src/session/ClientSession.ts` | 핸드셰이크 토큰 검증 |
| `src/panel/IdeaPanel.ts` | 인증 섹션 UI 추가 |
| `src/extension.ts` | Auth 초기화, UUID 생성, 콜백 연결 |
| `package.json` | 신규 설정 스키마, 버전 업 |
| `docs/IDEA_InputProtocol.md` | 프로토콜 업데이트 |
| `docs/IDEA_OutputProtocol.md` | 프로토콜 업데이트 |
| `README.md` | 버전 테이블 업데이트 |
| `CHANGELOG.md` | v0.1.3 섹션 추가 |

---

## 잠재적 개선 항목

아래는 확정되지 않은 향후 작업 후보 목록입니다.
실제 구현 시 위 포맷으로 섹션을 추가하세요.

- [ ] **멀티 워크스페이스 지원** — 다중 루트 워크스페이스 환경 대응
- [ ] **인증/보안** — Settings 에서 UUID 토큰을 만들고, 해당 토큰으로 접속할 수 있는 모드를 선택적으로 on 가능
- [ ] **테스트 확충** — `test/client.js`를 시나리오별 자동화 테스트로 확장
- [ ] **오류 처리 강화** — 핸들러별 상세 에러 코드 및 메시지 표준화
- [ ] **포트 충돌 감지** — 서버 시작 시 포트 사용 여부 사전 확인 및 사용자 안내

---

*완료된 항목은 `docs/TODO_History.md`를 참고하세요.*
