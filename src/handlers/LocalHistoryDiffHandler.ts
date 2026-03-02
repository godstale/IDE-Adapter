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

export class LocalHistoryDiffHandler implements IHandler {
  constructor(private readonly svc: LocalHistoryService) {}

  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : null;
    if (!filePath) {
      throw new HandlerError('INVALID_REQUEST', 'filePath parameter is required');
    }

    const fromId = typeof params['fromId'] === 'string' ? params['fromId'] : undefined;
    const toId   = typeof params['toId']   === 'string' ? params['toId']   : undefined;

    if (!fromId && !toId) {
      throw new HandlerError('INVALID_REQUEST', 'At least one of fromId or toId must be specified');
    }

    const absolutePath = resolveFilePath(filePath);
    const historyResult = await this.svc.findFileHistory(absolutePath);

    // Validate IDs against the entries list
    if (fromId) {
      const found = historyResult?.entries.some(e => e.id === fromId);
      if (!found) {
        throw new HandlerError('INVALID_REQUEST', `fromId "${fromId}" not found in local history`);
      }
    }
    if (toId) {
      const found = historyResult?.entries.some(e => e.id === toId);
      if (!found) {
        throw new HandlerError('INVALID_REQUEST', `toId "${toId}" not found in local history`);
      }
    }

    const historyDir = historyResult!.dir;

    let fromText: string;
    let fromLabel: string;
    if (fromId) {
      fromText = await this.svc.readSaveContent(historyDir, fromId);
      fromLabel = historyResult!.entries.find(e => e.id === fromId)!.timestampLabel;
    } else {
      fromText = await this.svc.readCurrentContent(absolutePath);
      fromLabel = 'current';
    }

    let toText: string;
    let toLabel: string;
    if (toId) {
      toText = await this.svc.readSaveContent(historyDir, toId);
      toLabel = historyResult!.entries.find(e => e.id === toId)!.timestampLabel;
    } else {
      toText = await this.svc.readCurrentContent(absolutePath);
      toLabel = 'current';
    }

    const diff = this.svc.computeUnifiedDiff(fromText, toText, fromLabel, toLabel);
    return { diff, fromLabel, toLabel };
  }
}
