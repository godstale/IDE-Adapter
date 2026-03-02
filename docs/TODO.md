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

### 수정 대상 파일
| 파일 | 작업 |
|------|------|
| `src/handlers/XxxHandler.ts` | 신규 생성 |
```

---

## 잠재적 개선 항목

아래는 확정되지 않은 향후 작업 후보 목록입니다.
실제 구현 시 위 포맷으로 섹션을 추가하세요.

- [ ] **테스트 확충** — `test/suite.js`에 localhistory 섹션 케이스 추가 및 엣지 케이스 보강
- [ ] **오류 처리 강화** — 핸들러별 상세 에러 코드 및 메시지 표준화
- [ ] **history/diff index=0 vs N>1 지원** — working tree와 N번째 이전 커밋 비교 (현재 index=0↔1만 허용)
- [ ] **VSIX 배포 자동화** — GitHub Actions로 태그 push 시 VSIX 자동 빌드 및 Release 첨부

---

*완료된 항목은 `docs/TODO_History.md`를 참고하세요.*
