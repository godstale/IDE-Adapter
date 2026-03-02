import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface LocalHistoryEntry {
  id: string;              // e.g. "IOCb.ts"
  timestamp: number;       // milliseconds epoch
  timestampLabel: string;  // "2026-03-02 10:00:00"
  source?: string;
}

interface EntriesJson {
  version: number;
  resource: string;
  entries: Array<{ id: string; timestamp: number; source?: string }>;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export class LocalHistoryService {
  private readonly historyDir: string;

  constructor(globalStorageFsPath: string) {
    const userDir = path.dirname(path.dirname(globalStorageFsPath));
    this.historyDir = path.join(userDir, 'History');
  }

  async findFileHistory(absPath: string): Promise<{ dir: string; entries: LocalHistoryEntry[] } | null> {
    if (!fs.existsSync(this.historyDir)) {
      return null;
    }

    const targetUri = vscode.Uri.file(absPath).toString().toLowerCase();

    let subdirs: string[];
    try {
      subdirs = fs.readdirSync(this.historyDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch {
      return null;
    }

    for (const sub of subdirs) {
      const entriesPath = path.join(this.historyDir, sub, 'entries.json');
      if (!fs.existsSync(entriesPath)) {
        continue;
      }

      let parsed: EntriesJson;
      try {
        const raw = fs.readFileSync(entriesPath, 'utf8');
        parsed = JSON.parse(raw) as EntriesJson;
      } catch {
        continue;
      }

      if (!parsed.resource) {
        continue;
      }

      const resourceUri = parsed.resource.toLowerCase();
      if (resourceUri !== targetUri) {
        continue;
      }

      const entries: LocalHistoryEntry[] = (parsed.entries ?? []).map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        timestampLabel: formatTimestamp(e.timestamp),
        source: e.source,
      }));

      return { dir: path.join(this.historyDir, sub), entries };
    }

    return null;
  }

  async readSaveContent(fileHistoryDir: string, saveId: string): Promise<string> {
    const filePath = path.join(fileHistoryDir, saveId);
    return fs.readFileSync(filePath, 'utf8');
  }

  async readCurrentContent(absPath: string): Promise<string> {
    return fs.readFileSync(absPath, 'utf8');
  }

  computeUnifiedDiff(oldText: string, newText: string, fromLabel: string, toLabel: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const m = oldLines.length;
    const n = newLines.length;

    // Fallback: if too large for LCS, treat as full replacement
    if (m * n > 4_000_000) {
      const hunks: string[] = [];
      hunks.push(`--- ${fromLabel}`);
      hunks.push(`+++ ${toLabel}`);
      hunks.push(`@@ -1,${m} +1,${n} @@`);
      for (const l of oldLines) { hunks.push(`-${l}`); }
      for (const l of newLines) { hunks.push(`+${l}`); }
      return hunks.join('\n');
    }

    // LCS DP
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (oldLines[i] === newLines[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    // Build edit script
    type EditOp = { op: 'eq' | 'del' | 'ins'; line: string; oldIdx: number; newIdx: number };
    const edits: EditOp[] = [];
    let i = 0, j = 0;
    while (i < m || j < n) {
      if (i < m && j < n && oldLines[i] === newLines[j]) {
        edits.push({ op: 'eq', line: oldLines[i], oldIdx: i, newIdx: j });
        i++; j++;
      } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
        edits.push({ op: 'ins', line: newLines[j], oldIdx: i, newIdx: j });
        j++;
      } else {
        edits.push({ op: 'del', line: oldLines[i], oldIdx: i, newIdx: j });
        i++;
      }
    }

    // Group into hunks with 3-line context
    const CONTEXT = 3;
    const output: string[] = [`--- ${fromLabel}`, `+++ ${toLabel}`];
    const len = edits.length;
    let idx = 0;

    while (idx < len) {
      // Find next changed edit
      while (idx < len && edits[idx].op === 'eq') { idx++; }
      if (idx >= len) { break; }

      const start = Math.max(0, idx - CONTEXT);
      let end = idx;
      // Extend to include all changes plus trailing context
      while (end < len) {
        if (edits[end].op !== 'eq') {
          end = Math.min(len, end + CONTEXT + 1);
        } else if (end < len && edits[end].op === 'eq') {
          // Check if there's another change within CONTEXT
          let lookAhead = end;
          let eqCount = 0;
          while (lookAhead < len && edits[lookAhead].op === 'eq') {
            eqCount++;
            lookAhead++;
          }
          if (lookAhead < len && eqCount <= CONTEXT * 2) {
            end = lookAhead;
          } else {
            end = Math.min(end + CONTEXT, len);
            break;
          }
        } else {
          break;
        }
      }

      const hunkEdits = edits.slice(start, end);
      // Compute old/new line ranges
      const oldStart = hunkEdits.find(e => e.op !== 'ins')?.oldIdx ?? 0;
      const newStart = hunkEdits.find(e => e.op !== 'del')?.newIdx ?? 0;
      const oldCount = hunkEdits.filter(e => e.op !== 'ins').length;
      const newCount = hunkEdits.filter(e => e.op !== 'del').length;

      output.push(`@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`);
      for (const e of hunkEdits) {
        if (e.op === 'eq')  { output.push(` ${e.line}`); }
        if (e.op === 'del') { output.push(`-${e.line}`); }
        if (e.op === 'ins') { output.push(`+${e.line}`); }
      }

      idx = end;
    }

    if (output.length === 2) {
      // No differences
      return '';
    }

    return output.join('\n');
  }
}
