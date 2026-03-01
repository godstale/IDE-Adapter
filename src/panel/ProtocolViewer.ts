import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Track open panels by docType to avoid duplicates
const openPanels = new Map<string, vscode.WebviewPanel>();

export function openProtocolViewer(
  extensionUri: vscode.Uri,
  docType: 'input' | 'output',
): void {
  const existing = openPanels.get(docType);
  if (existing) {
    existing.reveal();
    return;
  }

  const title = docType === 'input'
    ? 'IDEA Input Protocol'
    : 'IDEA Output Protocol';

  const fileName = docType === 'input'
    ? 'IDEA_InputProtocol.md'
    : 'IDEA_OutputProtocol.md';

  const panel = vscode.window.createWebviewPanel(
    `idea.protocol.${docType}`,
    title,
    vscode.ViewColumn.Beside,
    {
      enableScripts: false,
      localResourceRoots: [],
    },
  );

  openPanels.set(docType, panel);

  panel.onDidDispose(() => {
    openPanels.delete(docType);
  });

  const mdPath = path.join(extensionUri.fsPath, 'docs', fileName);
  let mdContent = '';
  try {
    mdContent = fs.readFileSync(mdPath, 'utf8');
  } catch {
    mdContent = `# Error\n\nCould not read ${fileName}`;
  }

  panel.webview.html = buildHtml(title, mdToHtml(mdContent));
}

// ─── Minimal Markdown → HTML converter ────────────────────────────────────────

function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let inTable = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fences
    if (line.startsWith('```')) {
      if (inList) { output.push('</ul>'); inList = false; }
      if (inTable) { output.push('</tbody></table>'); inTable = false; }
      if (inCodeBlock) {
        output.push('</code></pre>');
        inCodeBlock = false;
      } else {
        const lang = line.slice(3).trim();
        output.push(`<pre><code class="language-${esc(lang)}">`);
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      output.push(esc(line));
      continue;
    }

    // Table rows (lines that start with |)
    if (line.trimStart().startsWith('|')) {
      if (inList) { output.push('</ul>'); inList = false; }
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      // Separator row
      if (cells.every(c => /^[-:]+$/.test(c))) {
        continue;
      }
      if (!inTable) {
        output.push('<table><thead><tr>');
        cells.forEach(c => output.push(`<th>${inlineFormat(c)}</th>`));
        output.push('</tr></thead><tbody>');
        inTable = true;
        continue;
      }
      output.push('<tr>');
      cells.forEach(c => output.push(`<td>${inlineFormat(c)}</td>`));
      output.push('</tr>');
      continue;
    } else if (inTable) {
      output.push('</tbody></table>');
      inTable = false;
    }

    // Blank line
    if (line.trim() === '') {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('');
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      if (inList) { output.push('</ul>'); inList = false; }
      const level = h[1].length;
      output.push(`<h${level}>${inlineFormat(h[2])}</h${level}>`);
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<hr>');
      continue;
    }

    // List items
    const li = line.match(/^[-*]\s+(.*)/);
    if (li) {
      if (!inList) { output.push('<ul>'); inList = true; }
      output.push(`<li>${inlineFormat(li[1])}</li>`);
      continue;
    } else if (inList) {
      output.push('</ul>');
      inList = false;
    }

    // Paragraph
    output.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inCodeBlock) { output.push('</code></pre>'); }
  if (inTable) { output.push('</tbody></table>'); }
  if (inList) { output.push('</ul>'); }

  return output.join('\n');
}

function inlineFormat(text: string): string {
  return text
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── HTML shell ───────────────────────────────────────────────────────────────

function buildHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px 24px;
    line-height: 1.6;
    max-width: 900px;
  }
  h1, h2, h3, h4 { color: var(--vscode-foreground); margin-top: 1.2em; }
  h1 { font-size: 1.6em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 6px; }
  h2 { font-size: 1.3em; }
  hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 1.2em 0; }
  code {
    font-family: var(--vscode-editor-font-family, monospace);
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.9em;
  }
  pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 12px 14px;
    border-radius: 4px;
    overflow-x: auto;
  }
  pre code { background: none; padding: 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }
  th, td {
    border: 1px solid var(--vscode-panel-border);
    padding: 6px 10px;
    text-align: left;
  }
  th { background: var(--vscode-list-hoverBackground); font-weight: 600; }
  a { color: var(--vscode-textLink-foreground); }
  ul { padding-left: 1.5em; }
  li { margin: 2px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
