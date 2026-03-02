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

export class FileDiffHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : null;
    if (!filePath) {
      throw new HandlerError('INVALID_REQUEST', 'filePath parameter is required');
    }

    const absolutePath = resolveFilePath(filePath);
    const fileUri = vscode.Uri.file(absolutePath);
    const repo = getGitRepository(fileUri);

    // Determine mode: Index or Ref
    const hasFromIndex = typeof params['fromIndex'] === 'number';
    const hasToIndex   = typeof params['toIndex']   === 'number';
    const hasFromRef   = typeof params['fromRef']   === 'string';
    const hasToRef     = typeof params['toRef']     === 'string';

    let diff: string;
    let fromRefLabel: string;
    let toRefLabel: string;

    if (hasFromIndex || hasToIndex) {
      // ── Index mode ──────────────────────────────────────────────
      const fromIndex = hasFromIndex ? (params['fromIndex'] as number) : 0;
      const toIndex   = hasToIndex   ? (params['toIndex']   as number) : 1;

      if (fromIndex === 0) {
        // Working tree involved
        if (toIndex !== 1) {
          throw new HandlerError(
            'INVALID_REQUEST',
            'fromIndex=0 (working tree) only supports toIndex=1 (HEAD) in this version',
          );
        }
        try {
          diff = await repo.diffWithHEAD(absolutePath);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new HandlerError('HANDLER_ERROR', `Failed to compute diff: ${msg}`);
        }
        fromRefLabel = 'working-tree';
        toRefLabel   = 'HEAD';
      } else {
        // Both sides are commits
        if (toIndex === 0) {
          throw new HandlerError(
            'INVALID_REQUEST',
            'toIndex=0 (working tree) is not supported when fromIndex > 0',
          );
        }
        fromRefLabel = indexToRef(fromIndex);
        toRefLabel   = indexToRef(toIndex);
        try {
          diff = await repo.diffBetween(fromRefLabel, toRefLabel, absolutePath);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new HandlerError('HANDLER_ERROR', `Failed to compute diff: ${msg}`);
        }
      }
    } else if (hasFromRef || hasToRef) {
      // ── Ref mode ────────────────────────────────────────────────
      fromRefLabel = hasFromRef ? (params['fromRef'] as string) : 'HEAD';
      toRefLabel   = hasToRef   ? (params['toRef']   as string) : 'HEAD';
      try {
        diff = await repo.diffBetween(fromRefLabel, toRefLabel, absolutePath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new HandlerError('HANDLER_ERROR', `Failed to compute diff: ${msg}`);
      }
    } else {
      // Default: working tree vs HEAD
      try {
        diff = await repo.diffWithHEAD(absolutePath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new HandlerError('HANDLER_ERROR', `Failed to compute diff: ${msg}`);
      }
      fromRefLabel = 'working-tree';
      toRefLabel   = 'HEAD';
    }

    return { diff, fromRef: fromRefLabel, toRef: toRefLabel };
  }
}
