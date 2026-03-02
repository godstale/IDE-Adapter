import * as vscode from 'vscode';
import * as path from 'path';
import { IHandler, HandlerError } from '../protocol/types.js';
import { LocalHistoryService } from './LocalHistoryService.js';

function resolveFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) { return filePath; }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return path.join(folders[0].uri.fsPath, filePath);
  }
  return path.resolve(filePath);
}

export class LocalHistoryRollbackHandler implements IHandler {
  constructor(private readonly svc: LocalHistoryService) {}

  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : null;
    if (!filePath) {
      throw new HandlerError('INVALID_REQUEST', 'filePath parameter is required');
    }

    const toId = typeof params['toId'] === 'string' ? params['toId'] : null;
    if (!toId) {
      throw new HandlerError('INVALID_REQUEST', 'toId parameter is required');
    }

    const absolutePath = resolveFilePath(filePath);
    const historyResult = await this.svc.findFileHistory(absolutePath);

    const entry = historyResult?.entries.find(e => e.id === toId);
    if (!entry) {
      throw new HandlerError('INVALID_REQUEST', `toId "${toId}" not found in local history`);
    }

    let content: string;
    try {
      content = await this.svc.readSaveContent(historyResult!.dir, toId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HandlerError('HANDLER_ERROR', `Failed to read history entry: ${msg}`);
    }

    const fileUri = vscode.Uri.file(absolutePath);
    try {
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HandlerError('HANDLER_ERROR', `Failed to write file: ${msg}`);
    }

    return {
      filePath: absolutePath,
      restoredId: toId,
      restoredLabel: entry.timestampLabel,
    };
  }
}
