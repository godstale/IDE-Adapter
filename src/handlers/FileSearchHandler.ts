import * as vscode from 'vscode';
import * as path from 'path';
import { IHandler, HandlerError } from '../protocol/types.js';

export class FileSearchHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const query = typeof params['query'] === 'string' ? params['query'] : null;
    if (!query) {
      throw new HandlerError('INVALID_REQUEST', 'query parameter is required');
    }

    const includeParam = typeof params['include'] === 'string' ? params['include'] : null;
    const excludeParam = typeof params['exclude'] === 'string' ? params['exclude'] : undefined;
    const maxResults   = typeof params['maxResults'] === 'number' ? params['maxResults'] : 100;

    // Build glob pattern: if include is provided, embed the query into it.
    // e.g. include='**/*.ts', query='Handler' → '**/*Handler*.ts'
    // If no include, use '**/*query*'
    let includeGlob: string;
    if (includeParam) {
      const ext = path.extname(includeParam);
      const dir = includeParam.slice(0, includeParam.length - path.basename(includeParam).length);
      const baseStem = path.basename(includeParam, ext);
      // Replace the filename part with *query*
      const newBase = baseStem === '**' || baseStem === '*' ? `*${query}*` : `*${query}*${ext}`;
      includeGlob = dir + newBase;
    } else {
      includeGlob = `**/*${query}*`;
    }

    let includePattern: vscode.GlobPattern = includeGlob;
    let excludePattern: vscode.GlobPattern | null | undefined = excludeParam;

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      includePattern = new vscode.RelativePattern(folders[0], includeGlob);
      if (excludeParam) {
        excludePattern = new vscode.RelativePattern(folders[0], excludeParam);
      }
    }

    let uris: vscode.Uri[];
    try {
      uris = await vscode.workspace.findFiles(includePattern, excludePattern, maxResults);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HandlerError('HANDLER_ERROR', `findFiles failed: ${msg}`);
    }

    // Post-filter: ensure the filename (without path) actually contains the query (case-insensitive)
    const lowerQuery = query.toLowerCase();
    const filtered = uris.filter(u => path.basename(u.fsPath).toLowerCase().includes(lowerQuery));

    const workspaceRoot = folders && folders.length > 0 ? folders[0].uri.fsPath : '';

    const files = filtered.map(u => {
      const fsPath = u.fsPath;
      const relativePath = workspaceRoot
        ? path.relative(workspaceRoot, fsPath).replace(/\\/g, '/')
        : fsPath;
      return {
        fileName: path.basename(fsPath),
        filePath: fsPath,
        relativePath,
      };
    });

    return { files, totalCount: files.length };
  }
}
