import * as vscode from 'vscode';
import * as path from 'path';
import { IHandler, HandlerError } from '../protocol/types.js';
import type { GitExtension, GitRepository } from '../types/git.js';

function resolveFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) { return filePath; }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return path.join(folders[0].uri.fsPath, filePath);
  }
  return path.resolve(filePath);
}

function getGitRepository(fileUri: vscode.Uri): GitRepository {
  const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!gitExt) {
    throw new HandlerError('HANDLER_ERROR', 'VS Code git extension is not available');
  }
  if (!gitExt.isActive) {
    throw new HandlerError('HANDLER_ERROR', 'VS Code git extension is not active');
  }
  const api = gitExt.exports.getAPI(1);
  const repo = api.getRepository(fileUri);
  if (!repo) {
    throw new HandlerError('HANDLER_ERROR', 'No git repository found for the given file path');
  }
  return repo;
}

/** Converts a history index to a git ref string. index=1 → 'HEAD', index=N → 'HEAD~(N-1)' */
function indexToRef(index: number): string {
  if (index === 1) { return 'HEAD'; }
  return `HEAD~${index - 1}`;
}

export class FileRollbackHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : null;
    if (!filePath) {
      throw new HandlerError('INVALID_REQUEST', 'filePath parameter is required');
    }

    const toIndex = typeof params['toIndex'] === 'number' ? params['toIndex'] : null;
    if (toIndex === null) {
      throw new HandlerError('INVALID_REQUEST', 'toIndex parameter is required');
    }
    if (toIndex < 1) {
      throw new HandlerError('INVALID_REQUEST', 'toIndex must be >= 1 (1=HEAD, 2=HEAD~1, ...)');
    }

    const absolutePath = resolveFilePath(filePath);
    const fileUri = vscode.Uri.file(absolutePath);
    const repo = getGitRepository(fileUri);

    const toRef = indexToRef(toIndex);

    let content: string;
    try {
      content = await repo.show(toRef, absolutePath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HandlerError('HANDLER_ERROR', `Failed to retrieve file content at ${toRef}: ${msg}`);
    }

    try {
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HandlerError('HANDLER_ERROR', `Failed to write file: ${msg}`);
    }

    return { filePath: absolutePath, toRef, restoredIndex: toIndex };
  }
}
