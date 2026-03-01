import * as vscode from 'vscode';
import { IdeaServer } from './server/IdeaServer.js';
import { HandlerRegistry } from './handlers/HandlerRegistry.js';
import { IdeaLogger } from './logger/IdeaLogger.js';
import { IdeaPanel } from './panel/IdeaPanel.js';
import { FindHandler } from './handlers/FindHandler.js';
import { ReplaceHandler } from './handlers/ReplaceHandler.js';
import { DefinitionHandler } from './handlers/DefinitionHandler.js';
import { ReferencesHandler } from './handlers/ReferencesHandler.js';

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

  // Server
  server = new IdeaServer(registry, logger, (port, connections) => {
    updateStatusBar(port, connections);
    panel?.updateServerStatus(port > 0, port, connections);
  });

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

async function startServer(overridePort?: number): Promise<void> {
  if (!server) { return; }
  const config = vscode.workspace.getConfiguration('idea.server');
  const port = overridePort ?? config.get<number>('port', 7200);
  try {
    await server.start(port);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`IDEA: Failed to start server on port ${port}: ${msg}`);
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
