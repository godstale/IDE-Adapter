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

export class FileHistoryHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : null;
    if (!filePath) {
      throw new HandlerError('INVALID_REQUEST', 'filePath parameter is required');
    }

    const maxCount = typeof params['maxCount'] === 'number' ? params['maxCount'] : 20;

    const absolutePath = resolveFilePath(filePath);
    const fileUri = vscode.Uri.file(absolutePath);
    const repo = getGitRepository(fileUri);

    let commits;
    try {
      commits = await repo.log({ path: absolutePath, maxEntries: maxCount });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HandlerError('HANDLER_ERROR', `Failed to retrieve git history: ${msg}`);
    }

    const entries = commits.map((commit, i) => ({
      index: i + 1,
      hash: commit.hash,
      shortHash: commit.hash.slice(0, 7),
      message: commit.message,
      authorName: commit.authorName ?? null,
      authorEmail: commit.authorEmail ?? null,
      authorDate: commit.authorDate ? commit.authorDate.toISOString() : null,
    }));

    return { entries, totalCount: entries.length };
  }
}
