import { WebSocketServer, WebSocket } from 'ws';
import { ClientSession } from '../session/ClientSession.js';
import { HandlerRegistry } from '../handlers/HandlerRegistry.js';
import { IdeaLogger } from '../logger/IdeaLogger.js';

export class IdeaServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Set<ClientSession>();
  private _port: number;
  private clientCounter = 0;

  constructor(
    private readonly registry: HandlerRegistry,
    private readonly logger: IdeaLogger,
    private readonly onStatusChange: (port: number, connectionCount: number) => void,
  ) {
    this._port = 0;
  }

  get port(): number {
    return this._port;
  }

  get connectionCount(): number {
    return this.sessions.size;
  }

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port });

      wss.on('listening', () => {
        this.wss = wss;
        this._port = port;
        console.log(`[IdeaServer] Listening on ws://localhost:${port}`);
        this.logger.logServerStart(port);
        this.onStatusChange(port, 0);
        resolve();
      });

      wss.on('error', (err) => {
        console.error('[IdeaServer] Server error:', err);
        reject(err);
      });

      wss.on('connection', (ws: WebSocket) => {
        const clientId = `client-${++this.clientCounter}`;
        const session = new ClientSession(ws, this.registry, clientId, this.logger);
        this.sessions.add(session);
        this.logger.logClientConnect(clientId);
        this.onStatusChange(this._port, this.sessions.size);

        ws.on('close', () => {
          this.sessions.delete(session);
          this.onStatusChange(this._port, this.sessions.size);
        });
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
