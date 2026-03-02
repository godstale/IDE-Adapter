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

export class LocalHistoryListHandler implements IHandler {
  constructor(private readonly svc: LocalHistoryService) {}

  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : null;
    if (!filePath) {
      throw new HandlerError('INVALID_REQUEST', 'filePath parameter is required');
    }

    const absolutePath = resolveFilePath(filePath);
    const result = await this.svc.findFileHistory(absolutePath);

    if (!result) {
      return { entries: [], totalCount: 0 };
    }

    return { entries: result.entries, totalCount: result.entries.length };
  }
}
