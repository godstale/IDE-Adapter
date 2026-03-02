import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { IdeaServer } from './server/IdeaServer.js';
import { HandlerRegistry } from './handlers/HandlerRegistry.js';
import { IdeaLogger } from './logger/IdeaLogger.js';
import { IdeaPanel } from './panel/IdeaPanel.js';
import { FindHandler } from './handlers/FindHandler.js';
import { ReplaceHandler } from './handlers/ReplaceHandler.js';
import { DefinitionHandler } from './handlers/DefinitionHandler.js';
import { ReferencesHandler } from './handlers/ReferencesHandler.js';
import { DiagnosticHandler } from './handlers/DiagnosticHandler.js';
import { SymbolHandler } from './handlers/SymbolHandler.js';
import { FileHistoryHandler } from './handlers/FileHistoryHandler.js';
import { FileDiffHandler } from './handlers/FileDiffHandler.js';
import { FileSearchHandler } from './handlers/FileSearchHandler.js';
import { FileRollbackHandler } from './handlers/FileRollbackHandler.js';
import { LocalHistoryService } from './handlers/LocalHistoryService.js';
import { LocalHistoryListHandler } from './handlers/LocalHistoryListHandler.js';
import { LocalHistoryDiffHandler } from './handlers/LocalHistoryDiffHandler.js';
import { LocalHistoryRollbackHandler } from './handlers/LocalHistoryRollbackHandler.js';
import { AuthConfig } from './protocol/types.js';

let server: IdeaServer | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
let panel: IdeaPanel | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[IDEA] Extension activating');

  // Logger
  const logger = new IdeaLogger();

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.tooltip = 'IDEA Adapter server status';
  statusBarItem.command = 'idea.toggleServer';
  context.subscriptions.push(statusBarItem);

  // Handler registry
  const registry = new HandlerRegistry();
  registry.register('/app/vscode/edit/find',       new FindHandler());
  registry.register('/app/vscode/edit/replace',    new ReplaceHandler());
  registry.register('/app/vscode/nav/definition',  new DefinitionHandler());
  registry.register('/app/vscode/nav/references',  new ReferencesHandler());
  registry.register('/app/vscode/diag/list',        new DiagnosticHandler());
  registry.register('/app/vscode/nav/symbols',      new SymbolHandler());
  registry.register('/app/vscode/history/list',     new FileHistoryHandler());
  registry.register('/app/vscode/history/diff',     new FileDiffHandler());
  registry.register('/app/vscode/fs/findFiles',     new FileSearchHandler());
  registry.register('/app/vscode/history/rollback', new FileRollbackHandler());

  // Local History handlers
  const localHistorySvc = new LocalHistoryService(context.globalStorageUri.fsPath);
  registry.register('/app/vscode/localhistory/list',     new LocalHistoryListHandler(localHistorySvc));
  registry.register('/app/vscode/localhistory/diff',     new LocalHistoryDiffHandler(localHistorySvc));
  registry.register('/app/vscode/localhistory/rollback', new LocalHistoryRollbackHandler(localHistorySvc));

  // Auth config
  const authConfig = await getOrCreateAuthConfig();

  // Server
  server = new IdeaServer(registry, logger, (port, connections) => {
    updateStatusBar(port, connections);
    panel?.updateServerStatus(port > 0, port, connections);
  }, authConfig);

  // Sidebar panel
  panel = new IdeaPanel(
    context.extensionUri,
    logger,
    () => ({
      running: server !== null && server.port > 0,
      port: server?.port ?? 0,
      connections: server?.connectionCount ?? 0,
    }),
    async () => {
      if (server && server.port > 0) {
        await stopServer();
      } else {
        await startServer();
      }
    },
    async (port: number) => {
      await stopServer();
      const config = vscode.workspace.getConfiguration('idea.server');
      await config.update('port', port, vscode.ConfigurationTarget.Global);
      await startServer(port);
    },
    async () => {
      return getOrCreateAuthConfig();
    },
    async (enabled: boolean) => {
      const config = vscode.workspace.getConfiguration('idea.server');
      await config.update('authEnabled', enabled, vscode.ConfigurationTarget.Global);
      const updated = await getOrCreateAuthConfig();
      server?.updateAuthConfig(updated);
    },
    async () => {
      const newToken = crypto.randomUUID();
      const config = vscode.workspace.getConfiguration('idea.server');
      const exposeToken = config.get<boolean>('exposeToken', true);
      await config.update('authToken', newToken, vscode.ConfigurationTarget.Global);
      if (exposeToken) {
        await config.update('authToken', newToken, vscode.ConfigurationTarget.Workspace);
      }
      const updated = await getOrCreateAuthConfig();
      server?.updateAuthConfig(updated);
      return newToken;
    },
    async (expose: boolean) => {
      const config = vscode.workspace.getConfiguration('idea.server');
      await config.update('exposeToken', expose, vscode.ConfigurationTarget.Global);
      if (expose) {
        const token = config.get<string>('authToken', '');
        if (token) {
          await config.update('authToken', token, vscode.ConfigurationTarget.Workspace);
        }
      } else {
        await config.update('authToken', undefined, vscode.ConfigurationTarget.Workspace);
      }
    },
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('idea.toggleServer', async () => {
      if (server && server.port > 0) {
        await stopServer();
      } else {
        await startServer();
      }
    }),
    vscode.commands.registerCommand('idea.openPanel', () => {
      panel?.open(context);
    }),
  );

  // Auto-start server
  const config = vscode.workspace.getConfiguration('idea.server');
  if (config.get<boolean>('autoStart', true)) {
    await startServer();
  } else {
    updateStatusBarStopped();
  }
  // Auto-open panel (separate setting, default: false)
  const panelConfig = vscode.workspace.getConfiguration('idea.panel');
  if (panelConfig.get<boolean>('autoOpen', false)) {
    panel?.open(context);
  }
}

export async function deactivate(): Promise<void> {
  if (server) {
    await server.stop();
    server = null;
  }
  console.log('[IDEA] Extension deactivated');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateAuthConfig(): Promise<AuthConfig> {
  const config = vscode.workspace.getConfiguration('idea.server');
  const enabled = config.get<boolean>('authEnabled', true);
  const exposeToken = config.get<boolean>('exposeToken', true);
  let token = config.get<string>('authToken', '');

  if (enabled && token.trim() === '') {
    token = crypto.randomUUID();
    await config.update('authToken', token, vscode.ConfigurationTarget.Global);
    if (exposeToken) {
      await config.update('authToken', token, vscode.ConfigurationTarget.Workspace);
    }
  }
  return { enabled, token };
}

async function startServer(overridePort?: number): Promise<void> {
  if (!server) { return; }
  const config = vscode.workspace.getConfiguration('idea.server');
  const port = overridePort ?? config.get<number>('port', 7200);
  const authConfig = await getOrCreateAuthConfig();
  server.updateAuthConfig(authConfig);
  try {
    await server.start(port);
    // 실제 바인딩된 포트를 workspace settings에 저장 (외부 클라이언트가 읽을 수 있도록)
    await config.update('port', server.port, vscode.ConfigurationTarget.Workspace);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`IDEA: Failed to start server: ${msg}`);
    updateStatusBarStopped();
    panel?.updateServerStatus(false, 0, 0);
  }
}

async function stopServer(): Promise<void> {
  if (!server) { return; }
  await server.stop();
  updateStatusBarStopped();
  panel?.updateServerStatus(false, 0, 0);
}

function updateStatusBar(port: number, connections: number): void {
  if (!statusBarItem) { return; }
  statusBarItem.text = `$(radio-tower) IDEA :${port} (${connections})`;
  statusBarItem.show();
}

function updateStatusBarStopped(): void {
  if (!statusBarItem) { return; }
  statusBarItem.text = '$(debug-disconnect) IDEA (stopped)';
  statusBarItem.show();
}
