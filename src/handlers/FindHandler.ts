import * as vscode from 'vscode';
import { IHandler, HandlerError } from '../protocol/types.js';

interface FindMatch {
  filePath: string;
  line: number;
  character: number;
  lineText: string;
}

export class FindHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const pattern = typeof params['pattern'] === 'string' ? params['pattern'] : null;
    if (!pattern) {
      throw new HandlerError('INVALID_REQUEST', 'pattern parameter is required');
    }

    const include = typeof params['include'] === 'string' ? params['include'] : '**/*';
    const exclude = typeof params['exclude'] === 'string' ? params['exclude'] : undefined;
    const isRegex = params['isRegex'] === true;
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

    const flags = isCaseSensitive ? 'g' : 'gi';
    const source = isRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(source, flags);

    const matches: FindMatch[] = [];

    for (const uri of uris) {
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(uri);
      } catch {
        continue; // skip binary files (e.g. .zip, images)
      }
      for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
        const lineText = doc.lineAt(lineIndex).text;
        searchRegex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = searchRegex.exec(lineText)) !== null) {
          matches.push({ filePath: uri.fsPath, line: lineIndex, character: match.index, lineText });
          if (match[0].length === 0) { searchRegex.lastIndex++; }
        }
      }
    }

    return { matches, totalCount: matches.length };
  }
}
