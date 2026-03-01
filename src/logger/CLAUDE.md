# src/logger/

이벤트 기반 로그 수집기. 링버퍼 + EventEmitter.

## IdeaLogger.ts

**역할**: 모든 서버 이벤트를 `LogEntry`로 기록하고 실시간 스트리밍

```typescript
class IdeaLogger extends EventEmitter
  // 로그 emit helpers
  logServerStart(port)
  logServerStop()
  logClientConnect(clientId)
  logClientDisconnect(clientId)
  logHandshake(clientId, workspacePath)
  logRequest(clientId, topic, requestId, params)
  logResponse(clientId, topic, requestId, result)
  logError(clientId, topic, requestId, code, message)

  // 히스토리 조회
  getAll(): LogEntry[]     // 링버퍼 전체 복사본 반환
```

## LogEntry 구조
```typescript
{
  id: number;              // 단조 증가 카운터
  timestamp: Date;
  kind: LogKind;           // 아래 참조
  clientId: string;        // "client-N" 또는 "" (서버 이벤트)
  topic: string;           // 요청/응답 시만 설정
  requestId: string;
  summary: string;         // UI 표시용 한 줄 요약
  detail: Record<string, unknown> | null;  // JSON 펼치기용
}
```

## LogKind 색상 (IdeaPanel)
| Kind | 색상 |
|------|------|
| `SERVER_START`, `SERVER_STOP` | 파란색 |
| `CLIENT_CONNECT` | 초록색 |
| `CLIENT_DISCONNECT` | 빨간색 |
| `HANDSHAKE` | 주황색 |
| `REQUEST` | 보라색 |
| `RESPONSE` | 연초록 |
| `ERROR` | 분홍색 |

## 이벤트 구독 패턴
```typescript
logger.on('entry', (entry: LogEntry) => {
  // IdeaPanel에서 실시간으로 webview에 postMessage
  this.postMessage({ type: 'logEntry', entry: serializeEntry(entry) });
});
```

**링버퍼 크기**: 500 (`RING_SIZE` 상수). 초과 시 가장 오래된 항목 제거.
