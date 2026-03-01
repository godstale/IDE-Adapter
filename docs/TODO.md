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


## [Test Bug Fix + DefinitionHandler 개선] — 2026-03-01

### 목표
`test/suite.js` 테스트 실패 5건 수정 + suite.js에 requestId 로깅 추가

### 원인 분석

| # | 실패 테스트 | 원인 |
|---|------------|------|
| 1 | `isRegex: false → 특수문자 리터럴 처리` | `class(` 문자열이 `test/suite.js:282`, `test/TEST_RESULT.txt`에 존재. 기본 `include: '**/*'`가 테스트 파일도 검색 |
| 2 | `isCaseSensitive: true → 대소문자 일치해야 매치` | `IDEASERVER` 문자열이 `test/suite.js`, `test/TEST_RESULT.txt`에 존재 |
| 3 | `매치 없는 pattern → totalCount: 0` | `xXx_NONEXISTENT_xXx` 문자열이 `test/suite.js:322`에 존재 |
| 4 | `replace → replacedCount must be 0` | `xXx_NONEXISTENT_PATTERN_xXx`가 `test/suite.js:344`에 존재 → ReplaceHandler가 **실제로 suite.js를 수정** (심각) |
| 5 | `DefinitionHandler → types.ts 타임아웃` | Issue 4로 suite.js 수정 → TS 언어 서버 재인덱싱 발생 → 이후 첫 번째 `executeDefinitionProvider` 호출 시 TS 서버 바쁨 + 200ms 대기 부족 |

### 구현 계획

#### test/suite.js 수정 (1·2·3번 수정)
- [x] `isRegex: false` 테스트: `include: 'src/**/*.ts'` 추가 (src/ 에는 `class(` 리터럴 없음)
- [x] `isCaseSensitive: true` 테스트: `include: 'src/**/*.ts'` 추가 (src/ 에는 `IDEASERVER` 없음)
- [x] `매치 없는 pattern` 테스트: `include: 'src/**/*.ts'` 추가 (src/ 에는 패턴 없음)

#### test/suite.js 수정 (4번 수정 — 심각)
- [x] replace 기본 테스트: `include: 'src/**/*.ts'` 추가 → src/ 에는 패턴 없으므로 실제 파일 수정 없음
- [x] **SAFE_PAT 주석 정정**: "프로젝트에 존재하지 않는 안전한 패턴"은 틀린 설명 → 주석 수정

#### src/handlers/DefinitionHandler.ts 수정 (5번 수정)
- [x] TS 언어 서버 대기 시간 200ms → 1500ms로 증가 (첫 호출 시 안정적으로 동작하도록)

#### test/suite.js — requestId 로깅 추가 (신규 요청)
- [x] `req()` 함수 내부에서 requestId를 회색으로 출력 (extension 로그와 매칭용)
- [x] `rawReq()` 함수도 동일하게 적용

### 수정 대상 파일
| 파일 | 작업 |
|------|------|
| `test/suite.js` | 실패 테스트 4건에 `include: 'src/**/*.ts'` 추가, requestId 로깅 |
| `src/handlers/DefinitionHandler.ts` | TS 서버 대기 시간 200ms → 1500ms |

---

## 잠재적 개선 항목

아래는 확정되지 않은 향후 작업 후보 목록입니다.
실제 구현 시 위 포맷으로 섹션을 추가하세요.

- [ ] **Phase 5: 진단 핸들러** — `/app/vscode/diag/list` (파일/워크스페이스 오류·경고 조회)
- [ ] **Phase 5: 심볼 핸들러** — `/app/vscode/nav/symbols` (문서 내 심볼 목록)
- [ ] **테스트 확충** — `test/client.js`를 시나리오별 자동화 테스트로 확장
- [ ] **오류 처리 강화** — 핸들러별 상세 에러 코드 및 메시지 표준화
- [ ] **포트 충돌 감지** — 서버 시작 시 포트 사용 여부 사전 확인 및 사용자 안내
- [ ] **멀티 워크스페이스 지원** — 다중 루트 워크스페이스 환경 대응
- [ ] **인증/보안** — 로컬 토큰 기반 클라이언트 인증 옵션

---

*완료된 항목은 `docs/TODO_History.md`를 참고하세요.*
