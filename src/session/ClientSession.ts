import * as vscode from 'vscode';
import WebSocket from 'ws';
import {
  IdeaSuccessResponse,
  IdeaErrorResponse,
  ServerHandshake,
  HandlerError,
  AuthConfig,
} from '../protocol/types.js';
import { HandlerRegistry } from '../handlers/HandlerRegistry.js';
import { IdeaLogger } from '../logger/IdeaLogger.js';

const VERSION = '0.1.3';

export class ClientSession {
  private handshakeDone = false;

  constructor(
    private readonly ws: WebSocket,
    private readonly registry: HandlerRegistry,
    private readonly clientId: string,
    private readonly logger: IdeaLogger,
    private readonly authConfig: AuthConfig,
  ) {
    ws.on('message', (raw) => this.onMessage(raw.toString()));
    ws.on('close', () => this.onClose());
    ws.on('error', (err) => {
      console.error('[ClientSession] ws error:', err);
      this.logger.logError(this.clientId, '', '', 'WS_ERROR', String(err));
    });
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private onMessage(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.sendError('', '', 'PARSE_ERROR', 'Invalid JSON');
      this.logger.logError(this.clientId, '', '', 'PARSE_ERROR', 'Invalid JSON');
      return;
    }

    if (!msg || typeof msg !== 'object') {
      this.sendError('', '', 'PARSE_ERROR', 'Message must be a JSON object');
      this.logger.logError(this.clientId, '', '', 'PARSE_ERROR', 'Message must be a JSON object');
      return;
    }

    const obj = msg as Record<string, unknown>;

    if (!this.handshakeDone) {
      this.handleHandshake(obj);
    } else {
      this.handleRequest(obj);
    }
  }

  private handleHandshake(obj: Record<string, unknown>): void {
    if (obj['type'] !== 'handshake') {
      this.sendRaw(JSON.stringify({
        type: 'handshake',
        error: 'First message must be { type: "handshake" }',
      }));
      this.logger.logError(this.clientId, '', '', 'HANDSHAKE_ERROR', 'Invalid handshake');
      this.ws.close();
      return;
    }

    // 인증 검증
    const authRequired = this.authConfig.enabled && this.authConfig.token.length > 0;
    if (authRequired) {
      const provided = typeof obj['token'] === 'string' ? obj['token'] : '';
      if (provided !== this.authConfig.token) {
        this.sendRaw(JSON.stringify({
          type: 'handshake',
          error: { code: 'UNAUTHORIZED', message: 'Invalid or missing authentication token' },
        }));
        this.logger.logError(this.clientId, '', '', 'UNAUTHORIZED', 'Invalid or missing token');
        this.ws.close();
        return;
      }
    }

    this.handshakeDone = true;

    const workspaces = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const response: ServerHandshake = {
      type: 'handshake',
      version: VERSION,
      authRequired,
      capabilities: this.registry.topics(),
      workspaces,
    };
    this.sendRaw(JSON.stringify(response));
    this.logger.logHandshake(this.clientId, workspaces.join(', ') || '(none)');
    console.log(`[ClientSession] Handshake OK — workspaces: ${workspaces.join(', ') || '(none)'}`);
  }

  private async handleRequest(obj: Record<string, unknown>): Promise<void> {
    const topic = typeof obj['topic'] === 'string' ? obj['topic'] : '';
    const requestId = typeof obj['requestId'] === 'string' ? obj['requestId'] : '';
    const params =
      obj['params'] && typeof obj['params'] === 'object'
        ? (obj['params'] as Record<string, unknown>)
        : {};

    if (!topic || !requestId) {
      this.sendError(topic, requestId, 'INVALID_REQUEST', 'topic and requestId are required');
      this.logger.logError(this.clientId, topic, requestId, 'INVALID_REQUEST', 'topic and requestId are required');
      return;
    }

    this.logger.logRequest(this.clientId, topic, requestId, params);

    const handler = this.registry.get(topic);
    if (!handler) {
      this.sendError(topic, requestId, 'UNKNOWN_TOPIC', `No handler registered for topic: ${topic}`);
      this.logger.logError(this.clientId, topic, requestId, 'UNKNOWN_TOPIC', `No handler: ${topic}`);
      return;
    }

    try {
      const result = await handler.handle(params);
      const response: IdeaSuccessResponse = { topic, requestId, result };
      this.sendRaw(JSON.stringify(response));
      this.logger.logResponse(this.clientId, topic, requestId, result);
    } catch (err: unknown) {
      const code = err instanceof HandlerError ? err.code : 'HANDLER_ERROR';
      const message = err instanceof Error ? err.message : String(err);
      this.sendError(topic, requestId, code, message);
      this.logger.logError(this.clientId, topic, requestId, code, message);
    }
  }

  private onClose(): void {
    this.logger.logClientDisconnect(this.clientId);
    console.log(`[ClientSession] Connection closed`);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private sendError(topic: string, requestId: string, code: string, message: string): void {
    const response: IdeaErrorResponse = { topic, requestId, error: { code, message } };
    this.sendRaw(JSON.stringify(response));
  }

  private sendRaw(json: string): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(json);
    }
  }
}
