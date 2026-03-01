import * as vscode from 'vscode';
import { IHandler, HandlerError } from '../protocol/types.js';

export class ReplaceHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const pattern     = typeof params['pattern']     === 'string' ? params['pattern']     : null;
    const replacement = typeof params['replacement'] === 'string' ? params['replacement'] : null;

    if (!pattern) {
      throw new HandlerError('INVALID_REQUEST', 'pattern parameter is required');
    }
    if (replacement === null) {
      throw new HandlerError('INVALID_REQUEST', 'replacement parameter is required');
    }

    const include         = typeof params['include'] === 'string' ? params['include'] : '**/*';
    const exclude         = typeof params['exclude'] === 'string' ? params['exclude'] : undefined;
    const isRegex         = params['isRegex']         === true;
    const isCaseSensitive = params['isCaseSensitive'] === true;

    let includePattern: vscode.GlobPattern = include;
    let excludePattern: vscode.GlobPattern | undefined | null = exclude;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      if (typeof include === 'string') {
        includePattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], include);
      }
      if (typeof exclude === 'string') {
        excludePattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], exclude);
      }
    }

    const uris = await vscode.workspace.findFiles(includePattern, excludePattern);

    const flags       = isCaseSensitive ? 'g' : 'gi';
    const source      = isRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(source, flags);
    // Single-match regex for computing per-match replacement text (handles capture groups $1, $2…)
    const singleRegex = new RegExp(source, isCaseSensitive ? '' : 'i');

    const edit              = new vscode.WorkspaceEdit();
    const affectedFiles: string[] = [];
    let   replacedCount     = 0;

    for (const uri of uris) {
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(uri);
      } catch {
        continue; // skip binary files (e.g. .zip, images)
      }
      let fileMatchCount = 0;

      for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
        const lineText = doc.lineAt(lineIndex).text;
        searchRegex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = searchRegex.exec(lineText)) !== null) {
          const range = new vscode.Range(
            lineIndex, match.index,
            lineIndex, match.index + match[0].length,
          );
          // For regex mode, allow capture-group references ($1, $2…) in replacement string
          const replaceText = isRegex ? match[0].replace(singleRegex, replacement) : replacement;
          edit.replace(uri, range, replaceText);
          fileMatchCount++;
          if (match[0].length === 0) { searchRegex.lastIndex++; }
        }
      }

      if (fileMatchCount > 0) {
        replacedCount += fileMatchCount;
        affectedFiles.push(uri.fsPath);
      }
    }

    if (replacedCount > 0) {
      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        throw new HandlerError('HANDLER_ERROR', 'Failed to apply workspace edits');
      }
    }

    return { replacedCount, affectedFiles };
  }
}
