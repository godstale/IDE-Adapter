import * as vscode from 'vscode';
import * as path from 'path';
import { IHandler, HandlerError } from '../protocol/types.js';

function resolveFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return path.join(folders[0].uri.fsPath, filePath);
  }
  return path.resolve(filePath);
}

const KIND_NAMES = [
  'file', 'module', 'namespace', 'package', 'class', 'method', 'property',
  'field', 'constructor', 'enum', 'interface', 'function', 'variable', 'constant',
  'string', 'number', 'boolean', 'array', 'object', 'key', 'null', 'enummember',
  'struct', 'event', 'operator', 'typeparameter',
];

interface SymbolEntry {
  name: string;
  kind: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  selectionLine: number;
  selectionCharacter: number;
  containerName: string | null;
}

function flattenDocSymbols(
  symbols: vscode.DocumentSymbol[],
  container: string | null = null,
): SymbolEntry[] {
  const result: SymbolEntry[] = [];
  for (const s of symbols) {
    result.push({
      name: s.name,
      kind: KIND_NAMES[s.kind] ?? String(s.kind),
      line: s.range.start.line,
      character: s.range.start.character,
      endLine: s.range.end.line,
      endCharacter: s.range.end.character,
      selectionLine: s.selectionRange.start.line,
      selectionCharacter: s.selectionRange.start.character,
      containerName: container,
    });
    if (s.children?.length) {
      result.push(...flattenDocSymbols(s.children, s.name));
    }
  }
  return result;
}

function fromSymbolInformation(sym: vscode.SymbolInformation): SymbolEntry {
  return {
    name: sym.name,
    kind: KIND_NAMES[sym.kind] ?? String(sym.kind),
    line: sym.location.range.start.line,
    character: sym.location.range.start.character,
    endLine: sym.location.range.end.line,
    endCharacter: sym.location.range.end.character,
    selectionLine: sym.location.range.start.line,
    selectionCharacter: sym.location.range.start.character,
    containerName: sym.containerName || null,
  };
}

export class SymbolHandler implements IHandler {
  async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : null;
    const query = typeof params['query'] === 'string' ? params['query'].toLowerCase() : null;

    if (filePath === null) {
      if ('filePath' in params) {
        throw new HandlerError('INVALID_REQUEST', 'filePath must be a string');
      }
      throw new HandlerError('INVALID_REQUEST', 'filePath is required');
    }

    const uri = vscode.Uri.file(resolveFilePath(filePath));

    // Ensure the file is loaded so the language service has it indexed
    try {
      await vscode.workspace.openTextDocument(uri);
    } catch {
      return { symbols: [], totalCount: 0 };
    }

    // Wait for language server to index the file
    await new Promise(resolve => setTimeout(resolve, 1500));

    const raw = await vscode.commands.executeCommand<
      (vscode.DocumentSymbol | vscode.SymbolInformation)[]
    >('vscode.executeDocumentSymbolProvider', uri) ?? [];

    let symbols: SymbolEntry[];

    if (raw.length === 0) {
      symbols = [];
    } else if ('children' in raw[0]) {
      // DocumentSymbol[]
      symbols = flattenDocSymbols(raw as vscode.DocumentSymbol[]);
    } else {
      // SymbolInformation[]
      symbols = (raw as vscode.SymbolInformation[]).map(fromSymbolInformation);
    }

    if (query) {
      symbols = symbols.filter(s => s.name.toLowerCase().includes(query));
    }

    return { symbols, totalCount: symbols.length };
  }
}
