# src/session/

클라이언트 연결별 상태 머신. 핸드셰이크 → 요청/응답 루프.

## ClientSession.ts

**역할**: 단일 WebSocket 연결의 메시지 파싱, 인증, 라우팅, 에러 처리

**생성자 파라미터**
```typescript
constructor(
  ws: WebSocket,
  registry: HandlerRegistry,
  clientId: string,       // "client-N" 형식, IdeaServer가 생성
  logger: IdeaLogger,
  authConfig: AuthConfig, // 토큰 인증 설정
)
```

**상태**
- `handshakeDone: boolean` — false 상태에서는 handshake 메시지만 허용

**메시지 흐름**
```
ws.on('message') → onMessage()
  ├── handshakeDone=false → handleHandshake()
  │     ├── authConfig.enabled=true → token 검증
  │     │     ├── 불일치: UNAUTHORIZED 에러 전송 + ws.close()
  │     │     └── 일치: 계속
  │     ├── 유효: handshakeDone=true, ServerHandshake(workspaces 포함) 응답 전송
  │     └── 무효: error 전송 + ws.close()
  └── handshakeDone=true  → handleRequest()
        ├── topic/requestId 없음 → INVALID_REQUEST
        ├── handler 없음 → UNKNOWN_TOPIC
        └── handler.handle() → IdeaSuccessResponse / HANDLER_ERROR
```

**핸드셰이크 응답 구조**:
```typescript
{
  type: 'handshake',
  version: string,       // 프로토콜 버전 (package.json에서 읽음)
  authRequired: boolean, // authConfig.enabled
  capabilities: string[], // 등록된 토픽 목록
  workspaces: string[],   // 현재 열린 워크스페이스 경로 목록
}
```

**에러 코드**
| 코드 | 원인 |
|------|------|
| `PARSE_ERROR` | JSON 파싱 실패 |
| `INVALID_REQUEST` | topic 또는 requestId 누락 |
| `UNKNOWN_TOPIC` | 등록된 핸들러 없음 |
| `HANDLER_ERROR` | handler.handle() throw |
| `UNAUTHORIZED` | 토큰 인증 실패 |
| `WS_ERROR` | ws 소켓 에러 이벤트 |

**로깅**: 모든 이벤트를 `logger.*` 메서드로 기록. `logger.logClientDisconnect()`는 `onClose()`에서 호출.
