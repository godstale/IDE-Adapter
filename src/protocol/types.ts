// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthConfig {
  enabled: boolean;
  token: string;  // 빈 문자열 = 미설정
}

// ─── Handshake ────────────────────────────────────────────────────────────────

export interface ClientHandshake {
  type: 'handshake';
  token?: string;  // 인증 필요 시 필수
}

export interface ServerHandshake {
  type: 'handshake';
  version: string;
  authRequired: boolean;
  capabilities: string[];
  workspaces: string[];
}

// ─── Request / Response ───────────────────────────────────────────────────────

export interface IdeaRequest {
  topic: string;
  requestId: string;
  params: Record<string, unknown>;
}

export interface IdeaSuccessResponse {
  topic: string;
  requestId: string;
  result: Record<string, unknown>;
}

export interface IdeaErrorResponse {
  topic: string;
  requestId: string;
  error: {
    code: string;
    message: string;
  };
}

export type IdeaResponse = IdeaSuccessResponse | IdeaErrorResponse;

// ─── Incoming message union ───────────────────────────────────────────────────

export type IncomingMessage = ClientHandshake | IdeaRequest;

// ─── Handler interface ────────────────────────────────────────────────────────

export interface IHandler {
  handle(params: Record<string, unknown>): Promise<Record<string, unknown>>;
}

// ─── Handler error (carries a protocol-level error code) ─────────────────────

export class HandlerError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'HandlerError';
  }
}
