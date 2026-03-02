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

interface ReferenceLocation {
  filePath: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
}

export class ReferencesHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath  = typeof params['filePath']  === 'string' ? params['filePath']  : null;
    const line      = typeof params['line']      === 'number' ? params['line']      : null;
    const character = typeof params['character'] === 'number' ? params['character'] : null;
    // includeDeclaration defaults to true (omitted = include)
    const includeDeclaration = params['includeDeclaration'] !== false;

    if (!filePath || line === null || character === null) {
      throw new HandlerError('INVALID_REQUEST', 'filePath, line, and character are required');
    }

    const uri      = vscode.Uri.file(resolveFilePath(filePath));
    const position = new vscode.Position(line, character);

    // executeReferenceProvider returns Location[] (not LocationLink[])
    const raw = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      uri,
      position,
    ) ?? [];

    let locations: ReferenceLocation[] = raw.map((loc) => ({
      filePath:     loc.uri.fsPath,
      line:         loc.range.start.line,
      character:    loc.range.start.character,
      endLine:      loc.range.end.line,
      endCharacter: loc.range.end.character,
    }));

    // Filter out the declaration position when includeDeclaration is false
    if (!includeDeclaration) {
      const defs = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        uri,
        position,
      ) ?? [];

      // Build a set of declaration {file, line, char} from the definition's selection range
      const declSet = defs.map((d) => {
        if ('targetUri' in d) {
          const selRange = d.targetSelectionRange ?? d.targetRange;
          return { file: d.targetUri.fsPath, line: selRange.start.line, char: selRange.start.character };
        }
        return { file: d.uri.fsPath, line: d.range.start.line, char: d.range.start.character };
      });

      locations = locations.filter(
        (loc) => !declSet.some((d) => d.file === loc.filePath && d.line === loc.line && d.char === loc.character),
      );
    }

    return { locations, totalCount: locations.length };
  }
}
