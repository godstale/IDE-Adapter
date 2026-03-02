import * as path from 'path';
import * as vscode from 'vscode';
import { IHandler, HandlerError } from '../protocol/types.js';

function resolveFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return path.join(folders[0].uri.fsPath, filePath);
  }
  return path.resolve(filePath);
}

interface DefinitionLocation {
  filePath: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  code: string;
}

export class DefinitionHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : null;
    const line = typeof params['line'] === 'number' ? params['line'] : null;
    const character = typeof params['character'] === 'number' ? params['character'] : null;

    if (!filePath || line === null || character === null) {
      throw new HandlerError('INVALID_REQUEST', 'filePath, line, and character are required');
    }

    const uri = vscode.Uri.file(resolveFilePath(filePath));
    const position = new vscode.Position(line, character);

    // Ensure the file is loaded so the TS language service has it indexed
    const sourceDoc = await vscode.workspace.openTextDocument(uri);

    // Pre-load directly imported files so the TS language service can resolve cross-file definitions
    const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
    const sourceDir = path.dirname(uri.fsPath);
    const openPromises: Promise<any>[] = [];
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importRegex.exec(sourceDoc.getText())) !== null) {
      const relPath = importMatch[1].replace(/\.js$/, '.ts');
      const absPath = path.resolve(sourceDir, relPath);
      openPromises.push(
        Promise.resolve(vscode.workspace.openTextDocument(vscode.Uri.file(absPath))).catch(() => null)
      );
    }
    await Promise.all(openPromises);

    // Wait for TS language server to parse and index the file (especially on first call)
    await new Promise(resolve => setTimeout(resolve, 1500));

    const results = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider',
      uri,
      position,
    ) ?? [];
    // console.log(`[DefinitionHandler] results:`, JSON.stringify(results));

    const locations: DefinitionLocation[] = [];

    for (const result of results) {
      // LocationLink has targetUri/targetRange; Location has uri/range
      const targetUri = 'targetUri' in result ? result.targetUri : result.uri;
      const targetRange = 'targetRange' in result ? result.targetRange : result.range;

      const doc = await vscode.workspace.openTextDocument(targetUri);
      const code = doc.getText(targetRange);

      locations.push({
        filePath: targetUri.fsPath,
        line: targetRange.start.line,
        character: targetRange.start.character,
        endLine: targetRange.end.line,
        endCharacter: targetRange.end.character,
        code,
      });
    }

    return { locations };
  }
}
