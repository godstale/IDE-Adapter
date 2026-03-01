# src/protocol/

WebSocket 프로토콜 타입 정의. 클라이언트↔서버 메시지 형태.

## types.ts — 인터페이스 요약

### 핸드셰이크
```typescript
// 클라이언트 → 서버 (첫 번째 메시지, 반드시)
ClientHandshake { type: 'handshake' }

// 서버 → 클라이언트 응답 (열려있는 워크스페이스 목록 포함)
ServerHandshake { type: 'handshake'; version: string; capabilities: string[]; workspaces: string[] }
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

## 프로토콜 규칙

- 첫 메시지는 반드시 `ClientHandshake`. 위반 시 서버가 소켓 즉시 닫음
- `requestId`는 클라이언트가 생성한 UUID v4 (응답에 그대로 에코)
- 에러 응답에도 `topic`/`requestId`가 포함되어 요청 추적 가능
- `capabilities` 배열 = 현재 등록된 토픽 목록

## 에러 코드 전체 목록
`PARSE_ERROR` | `INVALID_REQUEST` | `UNKNOWN_TOPIC` | `HANDLER_ERROR` | `WS_ERROR`
