import * as vscode from 'vscode';
import * as path from 'path';
import { IHandler, HandlerError } from '../protocol/types.js';

const FILE_ANALYSIS_WAIT_MS = 1500;
const MULTI_FILE_ANALYSIS_WAIT_MS = 2000;

const SHOW_DOC_OPTS: vscode.TextDocumentShowOptions = {
  preview: true,
  preserveFocus: true,
};

function resolveFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return path.join(folders[0].uri.fsPath, filePath);
  }
  return path.resolve(filePath);
}

const SEVERITY_MAP: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

const SEVERITY_NAMES = ['error', 'warning', 'information', 'hint'];

export class DiagnosticHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const severityStr = typeof params['severity'] === 'string' ? params['severity'] : 'all';

    if (severityStr !== 'all' && !(severityStr in SEVERITY_MAP)) {
      throw new HandlerError(
        'INVALID_REQUEST',
        `severity must be one of: error, warning, information, hint, all`,
      );
    }

    // filePath accepts string (single file) or string[] (multiple files)
    let filePaths: string[] | null = null;
    const rawFilePath = params['filePath'];
    if (typeof rawFilePath === 'string') {
      filePaths = [rawFilePath];
    } else if (Array.isArray(rawFilePath) && rawFilePath.every(f => typeof f === 'string')) {
      filePaths = rawFilePath as string[];
    } else if (rawFilePath !== undefined && rawFilePath !== null) {
      throw new HandlerError('INVALID_REQUEST', 'filePath must be a string or array of strings');
    }

    let pairs: [vscode.Uri, readonly vscode.Diagnostic[]][];

    if (filePaths && filePaths.length > 0) {
      const openedUris: vscode.Uri[] = [];
      for (const fp of filePaths) {
        const uri = vscode.Uri.file(resolveFilePath(fp));
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          // showTextDocument triggers the language server to open and analyze the file
          await vscode.window.showTextDocument(doc, SHOW_DOC_OPTS);
          openedUris.push(uri);
        } catch {
          if (filePaths.length === 1) {
            return { diagnostics: [], totalCount: 0 };
          }
          // For multi-file requests, skip unreadable files
        }
      }

      const waitMs = filePaths.length > 1 ? MULTI_FILE_ANALYSIS_WAIT_MS : FILE_ANALYSIS_WAIT_MS;
      await new Promise(resolve => setTimeout(resolve, waitMs));

      pairs = openedUris.map(uri => [uri, vscode.languages.getDiagnostics(uri)] as [vscode.Uri, readonly vscode.Diagnostic[]]);
    } else {
      // No filePath — return all diagnostics VS Code currently has
      pairs = vscode.languages.getDiagnostics();
    }

    const diagnostics = [];
    for (const [uri, diags] of pairs) {
      for (const d of diags) {
        if (severityStr !== 'all' && d.severity !== SEVERITY_MAP[severityStr]) {
          continue;
        }
        diagnostics.push({
          filePath: uri.fsPath,
          line: d.range.start.line,
          character: d.range.start.character,
          endLine: d.range.end.line,
          endCharacter: d.range.end.character,
          severity: SEVERITY_NAMES[d.severity] ?? 'error',
          message: d.message,
          source: d.source ?? null,
          code: d.code != null ? String(d.code) : null,
        });
      }
    }

    return { diagnostics, totalCount: diagnostics.length };
  }
}
