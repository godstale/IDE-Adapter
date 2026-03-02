import { WebSocketServer, WebSocket } from 'ws';
import { ClientSession } from '../session/ClientSession.js';
import { HandlerRegistry } from '../handlers/HandlerRegistry.js';
import { IdeaLogger } from '../logger/IdeaLogger.js';
import { AuthConfig } from '../protocol/types.js';

export class IdeaServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Set<ClientSession>();
  private _port: number;
  private clientCounter = 0;

  constructor(
    private readonly registry: HandlerRegistry,
    private readonly logger: IdeaLogger,
    private readonly onStatusChange: (port: number, connectionCount: number) => void,
    private authConfig: AuthConfig,
  ) {
    this._port = 0;
  }

  get port(): number {
    return this._port;
  }

  get connectionCount(): number {
    return this.sessions.size;
  }

  updateAuthConfig(config: AuthConfig): void {
    this.authConfig = config;
  }

  async start(basePort: number, maxRetries = 10): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const port = basePort + attempt;
      const success = await this.tryBind(port);
      if (success) { return; }
    }
    throw new Error(`포트 범위 ${basePort}~${basePort + maxRetries - 1} 전체 사용 중`);
  }

  private tryBind(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const wss = new WebSocketServer({ port });

      wss.on('listening', () => {
        this.wss = wss;
        this._port = port;
        console.log(`[IdeaServer] Listening on ws://localhost:${port}`);
        this.logger.logServerStart(port);
        this.attachConnectionHandler(wss);
        this.onStatusChange(port, 0);
        resolve(true);
      });

      wss.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[IdeaServer] Port ${port} in use, trying next...`);
          wss.close(() => resolve(false));
        } else {
          console.error('[IdeaServer] Server error:', err);
          wss.close(() => { throw err; });
        }
      });
    });
  }

  private attachConnectionHandler(wss: WebSocketServer): void {
    wss.on('connection', (ws: WebSocket) => {
      const clientId = `client-${++this.clientCounter}`;
      const session = new ClientSession(ws, this.registry, clientId, this.logger, this.authConfig);
      this.sessions.add(session);
      this.logger.logClientConnect(clientId);
      this.onStatusChange(this._port, this.sessions.size);

      ws.on('close', () => {
        this.sessions.delete(session);
        this.onStatusChange(this._port, this.sessions.size);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }
      this.wss.close(() => {
        this.wss = null;
        this.sessions.clear();
        this._port = 0;
        this.logger.logServerStop();
        console.log('[IdeaServer] Server stopped');
        resolve();
      });
    });
  }
}
