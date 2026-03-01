import { EventEmitter } from 'events';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogKind =
  | 'SERVER_START'
  | 'SERVER_STOP'
  | 'CLIENT_CONNECT'
  | 'CLIENT_DISCONNECT'
  | 'HANDSHAKE'
  | 'REQUEST'
  | 'RESPONSE'
  | 'ERROR';

export interface LogEntry {
  id: number;
  timestamp: Date;
  kind: LogKind;
  clientId: string;
  topic: string;
  requestId: string;
  summary: string;
  detail: Record<string, unknown> | null;
}

// ─── IdeaLogger ───────────────────────────────────────────────────────────────

const RING_SIZE = 500;

export class IdeaLogger extends EventEmitter {
  private readonly ring: LogEntry[] = [];
  private counter = 0;

  // ─── Public emit helpers ────────────────────────────────────────────────────

  logServerStart(port: number): void {
    this.add('SERVER_START', '', '', '', `Server started on port ${port}`, { port });
  }

  logServerStop(): void {
    this.add('SERVER_STOP', '', '', '', 'Server stopped', null);
  }

  logClientConnect(clientId: string): void {
    this.add('CLIENT_CONNECT', clientId, '', '', `${clientId} connected`, null);
  }

  logClientDisconnect(clientId: string): void {
    this.add('CLIENT_DISCONNECT', clientId, '', '', `${clientId} disconnected`, null);
  }

  logHandshake(clientId: string, workspacePath: string): void {
    this.add('HANDSHAKE', clientId, '', '', `Handshake OK — ${workspacePath}`, { workspacePath });
  }

  logRequest(clientId: string, topic: string, requestId: string, params: Record<string, unknown>): void {
    this.add('REQUEST', clientId, topic, requestId, `← ${topic} (${requestId.slice(0, 8)})`, { params });
  }

  logResponse(clientId: string, topic: string, requestId: string, result: Record<string, unknown>): void {
    this.add('RESPONSE', clientId, topic, requestId, `→ SUCCESS (${requestId.slice(0, 8)})`, { result });
  }

  logError(clientId: string, topic: string, requestId: string, code: string, message: string): void {
    this.add('ERROR', clientId, topic, requestId, `→ ERROR ${code}: ${message}`, { code, message });
  }

  // ─── History ────────────────────────────────────────────────────────────────

  getAll(): LogEntry[] {
    return [...this.ring];
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private add(
    kind: LogKind,
    clientId: string,
    topic: string,
    requestId: string,
    summary: string,
    detail: Record<string, unknown> | null,
  ): void {
    const entry: LogEntry = {
      id: ++this.counter,
      timestamp: new Date(),
      kind,
      clientId,
      topic,
      requestId,
      summary,
      detail,
    };

    if (this.ring.length >= RING_SIZE) {
      this.ring.shift();
    }
    this.ring.push(entry);

    this.emit('entry', entry);
  }
}
