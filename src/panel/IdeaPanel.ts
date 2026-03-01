import * as vscode from 'vscode';
import { IdeaLogger, LogEntry } from '../logger/IdeaLogger.js';
import { openProtocolViewer } from './ProtocolViewer.js';

// ─── WebviewPanel (editor tab) ────────────────────────────────────────────────

export class IdeaPanel {
  private webviewPanel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly logger: IdeaLogger,
    private readonly getServerStatus: () => { running: boolean; port: number; connections: number },
    private readonly onToggleServer: () => Promise<void>,
    private readonly onApplyPort: (port: number) => Promise<void>,
  ) {
    // Stream new log entries to the webview in real time
    logger.on('entry', (entry: LogEntry) => {
      this.postMessage({ type: 'logEntry', entry: serializeEntry(entry) });
    });
  }

  // Open (or reveal) the editor tab
  open(context: vscode.ExtensionContext): void {
    if (this.webviewPanel) {
      this.webviewPanel.reveal();
      return;
    }

    this.webviewPanel = vscode.window.createWebviewPanel(
      'idea.panel',
      'IDEA Adapter',
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [] },
    );

    this.webviewPanel.webview.html = this.buildHtml();

    // Receive messages from the webview
    this.webviewPanel.webview.onDidReceiveMessage(
      async (msg: { command: string; port?: number }) => {
        switch (msg.command) {
          case 'ready': {
            const status = this.getServerStatus();
            this.postMessage({ type: 'serverStatus', ...status });
            this.postMessage({
              type: 'allLogs',
              entries: this.logger.getAll().map(serializeEntry),
            });
            const panelConfig = vscode.workspace.getConfiguration('idea.panel');
            this.postMessage({ type: 'panelSettings', autoOpen: panelConfig.get<boolean>('autoOpen', false) });
            break;
          }
          case 'toggleServer':
            await this.onToggleServer();
            break;
          case 'applyPort':
            if (typeof msg.port === 'number') {
              await this.onApplyPort(msg.port);
            }
            break;
          case 'applyAutoOpen':
            await vscode.workspace.getConfiguration('idea.panel').update(
              'autoOpen',
              (msg as { command: string; value: boolean }).value,
              vscode.ConfigurationTarget.Global,
            );
            break;
          case 'openProtocol':
            openProtocolViewer(
              this.extensionUri,
              (msg as { command: string; docType: 'input' | 'output' }).docType ?? 'input',
            );
            break;
        }
      },
      undefined,
      context.subscriptions,
    );

    this.webviewPanel.onDidDispose(() => {
      this.webviewPanel = undefined;
    }, undefined, context.subscriptions);
  }

  // Called by extension.ts when server status changes
  updateServerStatus(running: boolean, port: number, connections: number): void {
    this.postMessage({ type: 'serverStatus', running, port, connections });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private postMessage(msg: unknown): void {
    this.webviewPanel?.webview.postMessage(msg);
  }

  private buildHtml(): string {
    const version = '0.1.0';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IDEA Adapter</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Tabs */
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }
  .tab {
    padding: 6px 14px;
    cursor: pointer;
    font-size: 12px;
    border-bottom: 2px solid transparent;
    color: var(--vscode-foreground);
    opacity: 0.7;
    user-select: none;
  }
  .tab.active {
    border-bottom-color: var(--vscode-focusBorder);
    opacity: 1;
    font-weight: 600;
  }

  /* Tab panels */
  .panel { display: none; flex: 1; overflow-y: auto; padding: 12px; flex-direction: column; }
  .panel.active { display: flex; }

  /* Settings */
  .section { margin-bottom: 16px; }
  .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; opacity: 0.6; margin-bottom: 8px; }
  .row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .label { opacity: 0.8; flex-shrink: 0; }
  .value { font-weight: 600; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .dot.on { background: #4ec94e; }
  .dot.off { background: #e05252; }
  .btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 4px 10px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  input[type="number"] {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 3px 6px;
    border-radius: 2px;
    width: 70px;
    font-size: 12px;
  }
  .info-link { color: var(--vscode-textLink-foreground); text-decoration: none; font-size: 12px; }
  .info-link:hover { text-decoration: underline; }
  .dev-info { font-size: 11px; opacity: 0.7; line-height: 1.7; }

  /* Logs */
  #log-container {
    flex: 1;
    overflow-y: auto;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    line-height: 1.5;
  }
  .log-entry { padding: 1px 4px; border-radius: 2px; cursor: default; }
  .log-entry:hover { background: var(--vscode-list-hoverBackground); }
  .log-time { color: var(--vscode-foreground); opacity: 0.5; margin-right: 4px; }
  .log-kind {
    display: inline-block;
    min-width: 12ch;
    font-weight: 600;
    margin-right: 4px;
  }
  .log-summary { opacity: 0.9; }
  .expand-btn {
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-size: 10px;
    padding: 0 2px;
    vertical-align: middle;
  }
  .log-detail {
    display: none;
    margin: 2px 0 4px 8px;
    background: var(--vscode-textCodeBlock-background);
    padding: 6px 8px;
    border-radius: 3px;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 10.5px;
    color: var(--vscode-foreground);
    opacity: 0.85;
  }
  .log-detail.open { display: block; }

  /* Kind colors */
  .kind-SERVER_START, .kind-SERVER_STOP { color: #4fc3f7; }
  .kind-CLIENT_CONNECT { color: #81c784; }
  .kind-CLIENT_DISCONNECT { color: #e57373; }
  .kind-HANDSHAKE { color: #ffb74d; }
  .kind-REQUEST { color: #ce93d8; }
  .kind-RESPONSE { color: #a5d6a7; }
  .kind-ERROR { color: #ef9a9a; }

  .log-controls { display: flex; gap: 6px; margin-bottom: 6px; flex-shrink: 0; }
</style>
</head>
<body>
<div class="tabs">
  <div class="tab active" data-tab="settings">Settings</div>
  <div class="tab" data-tab="logs">Logs</div>
</div>

<!-- Settings Panel -->
<div class="panel active" id="panel-settings">

  <div class="section">
    <div class="section-title">Extension</div>
    <div class="row">
      <span class="label">Version</span>
      <span class="value">${version}</span>
    </div>
    <div class="row">
      <span class="label">Protocol</span>
      <span class="value">0.1.0</span>
    </div>
    <div class="row" style="gap: 6px;">
      <button class="btn secondary" id="btn-input-proto">Input Protocol</button>
      <button class="btn secondary" id="btn-output-proto">Output Protocol</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Server</div>
    <div class="row">
      <span class="dot off" id="status-dot"></span>
      <span class="value" id="status-text">Stopped</span>
      <button class="btn" id="btn-toggle">Start</button>
    </div>
    <div class="row">
      <span class="label">Connections</span>
      <span class="value" id="connection-count">0</span>
    </div>
    <div class="row">
      <span class="label">Port</span>
      <input type="number" id="port-input" min="1024" max="65535" value="7200">
      <button class="btn" id="btn-apply-port">Apply</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Panel</div>
    <div class="row">
      <input type="checkbox" id="chk-auto-open">
      <label class="label" for="chk-auto-open">Auto open on startup</label>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Developer</div>
    <div class="dev-info">
      <div>godstale@hotmail.com</div>
      <div><a class="info-link" href="https://github.com/godstale/IDE-Adapter">github.com/godstale/IDE-Adapter</a></div>
    </div>
  </div>

</div>

<!-- Logs Panel -->
<div class="panel" id="panel-logs">
  <div class="log-controls">
    <button class="btn secondary" id="btn-clear-logs">Clear</button>
  </div>
  <div id="log-container"></div>
</div>

<script>
  const vscode = acquireVsCodeApi();

  // ── Tab switching ───────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ── Settings handlers ───────────────────────────────────────────────────────
  document.getElementById('chk-auto-open').addEventListener('change', (e) => {
    vscode.postMessage({ command: 'applyAutoOpen', value: e.target.checked });
  });

  document.getElementById('btn-toggle').addEventListener('click', () => {
    vscode.postMessage({ command: 'toggleServer' });
  });

  document.getElementById('btn-apply-port').addEventListener('click', () => {
    const port = parseInt(document.getElementById('port-input').value, 10);
    if (port >= 1024 && port <= 65535) {
      vscode.postMessage({ command: 'applyPort', port });
    }
  });

  document.getElementById('btn-input-proto').addEventListener('click', () => {
    vscode.postMessage({ command: 'openProtocol', docType: 'input' });
  });

  document.getElementById('btn-output-proto').addEventListener('click', () => {
    vscode.postMessage({ command: 'openProtocol', docType: 'output' });
  });

  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('log-container').innerHTML = '';
  });

  // ── Status update ───────────────────────────────────────────────────────────
  function applyStatus(running, port, connections) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const btn = document.getElementById('btn-toggle');
    const portInput = document.getElementById('port-input');
    const count = document.getElementById('connection-count');

    dot.className = 'dot ' + (running ? 'on' : 'off');
    text.textContent = running ? 'Running on :' + port : 'Stopped';
    btn.textContent = running ? 'Stop' : 'Start';
    if (!running) {
      portInput.removeAttribute('disabled');
    } else {
      portInput.setAttribute('disabled', 'true');
      portInput.value = port;
    }
    count.textContent = String(connections);
  }

  // ── Log rendering ───────────────────────────────────────────────────────────
  const logContainer = document.getElementById('log-container');
  let autoScroll = true;

  logContainer.addEventListener('scroll', () => {
    const el = logContainer;
    autoScroll = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
  });

  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatTime(ts) {
    const d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function appendEntry(entry) {
    const div = document.createElement('div');
    div.className = 'log-entry';

    const hasDetail = entry.detail !== null;
    div.innerHTML =
      '<span class="log-time">' + formatTime(entry.timestamp) + '</span>' +
      '<span class="log-kind kind-' + entry.kind + '">' + entry.kind + '</span>' +
      '<span class="log-summary">' + escHtml(entry.summary) + '</span>' +
      (hasDetail ? ' <button class="expand-btn" title="Toggle detail">&#9656;</button>' : '');

    if (hasDetail) {
      const detail = document.createElement('div');
      detail.className = 'log-detail';
      detail.textContent = JSON.stringify(entry.detail, null, 2);
      div.appendChild(detail);

      div.querySelector('.expand-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        detail.classList.toggle('open');
        btn.innerHTML = detail.classList.contains('open') ? '&#9662;' : '&#9656;';
      });
    }

    logContainer.appendChild(div);

    if (autoScroll) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Message handler ─────────────────────────────────────────────────────────
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'serverStatus':
        applyStatus(msg.running, msg.port, msg.connections);
        break;
      case 'logEntry':
        appendEntry(msg.entry);
        break;
      case 'allLogs':
        logContainer.innerHTML = '';
        msg.entries.forEach(appendEntry);
        break;
      case 'panelSettings':
        document.getElementById('chk-auto-open').checked = msg.autoOpen;
        break;
    }
  });

  // ── Signal ready ─────────────────────────────────────────────────────────────
  vscode.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function serializeEntry(entry: LogEntry): Record<string, unknown> {
  return {
    id: entry.id,
    timestamp: entry.timestamp.toISOString(),
    kind: entry.kind,
    clientId: entry.clientId,
    topic: entry.topic,
    requestId: entry.requestId,
    summary: entry.summary,
    detail: entry.detail,
  };
}
