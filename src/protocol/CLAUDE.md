# src/protocol/

WebSocket 프로토콜 타입 정의. 클라이언트↔서버 메시지 형태.

## types.ts — 인터페이스 요약

### 핸드셰이크
```typescript
// 클라이언트 → 서버 (첫 번째 메시지, 반드시)
ClientHandshake { type: 'handshake'; token?: string }

// 서버 → 클라이언트 응답
ServerHandshake {
  type: 'handshake';
  version: string;
  authRequired: boolean;
  capabilities: string[];   // 등록된 토픽 목록
  workspaces: string[];     // 현재 열린 워크스페이스 경로 목록
}
```

### 요청/응답
```typescript
IdeaRequest         { topic, requestId, params: Record<string,unknown> }
IdeaSuccessResponse { topic, requestId, result: Record<string,unknown> }
IdeaErrorResponse   { topic, requestId, error: { code: string; message: string } }
```

### 핸들러 인터페이스
```typescript
interface IHandler {
  handle(params: Record<string, unknown>): Promise<Record<string, unknown>>;
}
```

### 인증 설정
```typescript
interface AuthConfig {
  enabled: boolean;
  token: string;
}
```

## 프로토콜 규칙

- 첫 메시지는 반드시 `ClientHandshake`. 위반 시 서버가 소켓 즉시 닫음
- 인증 활성화 시 `token` 필드 필수. 토큰 불일치 → `UNAUTHORIZED` 에러 후 소켓 닫음
- `requestId`는 클라이언트가 생성한 UUID v4 (응답에 그대로 에코)
- 에러 응답에도 `topic`/`requestId`가 포함되어 요청 추적 가능
- `capabilities` 배열 = 현재 등록된 토픽 목록

## 에러 코드 전체 목록

| 코드 | 원인 |
|------|------|
| `PARSE_ERROR` | JSON 파싱 실패 |
| `INVALID_REQUEST` | topic 또는 requestId 누락, 잘못된 파라미터 |
| `UNKNOWN_TOPIC` | 등록된 핸들러 없음 |
| `HANDLER_ERROR` | handler.handle() throw |
| `UNAUTHORIZED` | 토큰 인증 실패 |
| `WS_ERROR` | ws 소켓 에러 이벤트 |
