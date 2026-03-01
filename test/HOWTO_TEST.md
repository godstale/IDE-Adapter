
## HOW TO USE test.js

- test/test.js 대화형 CLI 테스트 도구가 생성되었습니다.

## 구현 내용

 ┌─────────────────────┬──────────────────────────────────────────────────────────────────────┐
 │        기능         │                                 동작                                 │
 ├─────────────────────┼──────────────────────────────────────────────────────────────────────┤
 │ find <pattern>      │ WebSocket 연결 → find 요청 → file:line  lineText 목록 + 총 개수 출력 │
 ├─────────────────────┼──────────────────────────────────────────────────────────────────────┤
 │ replace <pat> <rep> │ replace 요청 → 교체 횟수 + 영향 파일 목록 출력                       │
 ├─────────────────────┼──────────────────────────────────────────────────────────────────────┤
 │ def <symbol>        │ find → 번호 목록 → readline 선택 → definition 코드 블록 출력         │
 ├─────────────────────┼──────────────────────────────────────────────────────────────────────┤
 │ ref <symbol>        │ find → 번호 목록 → readline 선택 → references 위치 목록 출력         │
 ├─────────────────────┼──────────────────────────────────────────────────────────────────────┤
 │ diag [filePath...]  │ 진단(오류·경고) 목록 출력. 파일 1개 또는 여러 개 지정 가능             │
 ├─────────────────────┼──────────────────────────────────────────────────────────────────────┤
 │ sym <filePath>      │ 파일 내 심볼(함수·클래스·인터페이스 등) 목록 출력                    │
 └─────────────────────┴──────────────────────────────────────────────────────────────────────┘

## 옵션

  --include=<glob>      파일 필터
  --exclude=<glob>      제외 패턴
  --regex               정규식 모드
  --case                대소문자 구분
  --severity=<level>    diag 전용: error|warning|information|hint|all (기본: all)
  --query=<name>        sym 전용: 심볼 이름 부분 일치 필터 (대소문자 무시)
  --port=<n>            WebSocket 포트 (기본: 7200)
  --help                도움말

## 검증 방법

- Extension Development Host에서 서버 실행 후:
```
  node test/test.js find "App()"
  node test/test.js def "App"
  node test/test.js ref "App" --include=src/*.tsx
  node test/test.js replace "old" "new" --include=src/*.tsx
  node test/test.js diag
  node test/test.js diag src/App.tsx
  node test/test.js diag src/App.tsx --severity=error
  node test/test.js diag src/App.tsx src/main.tsx
  node test/test.js sym src/App.tsx
  node test/test.js sym src/App.tsx --query=App
```
