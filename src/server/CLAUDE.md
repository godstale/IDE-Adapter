# src/server/

WebSocket 서버 레이어. `ws` 패키지의 `WebSocketServer` 래퍼.

## IdeaServer.ts

**역할**: WebSocket 서버 생명주기 관리 + 클라이언트 연결 수락

**생성자 파라미터**
```typescript
constructor(
  registry: HandlerRegistry,   // 핸들러 라우팅
  logger: IdeaLogger,          // 이벤트 로깅
  onStatusChange: (port: number, connectionCount: number) => void,
)
```

**주요 멤버**
- `start(port)` → `Promise<void>` : `WebSocketServer` 생성, listening 후 resolve
- `stop()` → `Promise<void>` : wss.close(), `_port = 0` 리셋
- `port` (getter) : 현재 포트, 0 = 중지 상태
- `connectionCount` (getter) : 활성 세션 수
- `clientCounter` : 연결마다 증가 → `client-1`, `client-2`, ...

**연결 흐름**
1. `wss.on('connection')` → clientId 생성 → `new ClientSession(...)` → sessions Set에 추가
2. `ws.on('close')` → sessions에서 제거 → `onStatusChange` 호출
3. `logger.logClientConnect()` / `logClientDisconnect()` 는 `ClientSession`이 담당

**주의사항**
- `stop()` 호출 후 반드시 `_port = 0`으로 리셋 (extension.ts의 `server.port > 0` 조건 체크)
- 서버 에러는 `wss.on('error')` 에서 reject → extension.ts가 에러 메시지 표시
