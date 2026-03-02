/**
 * Type declarations for the VS Code built-in git extension API.
 * vscode.extensions.getExtension('vscode.git') 로 획득.
 */

import type { Uri, Event, Disposable } from 'vscode';

export interface GitExtension {
  enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): GitAPI;
}

export interface GitAPI {
  readonly repositories: GitRepository[];
  readonly onDidOpenRepository: Event<GitRepository>;
  readonly onDidCloseRepository: Event<GitRepository>;
  getRepository(uri: Uri): GitRepository | null;
  toGitUri(uri: Uri, ref: string): Uri;
}

export interface GitRepository {
  readonly rootUri: Uri;
  log(options?: LogOptions): Promise<GitCommit[]>;
  diffWithHEAD(): Promise<string>;
  diffWithHEAD(path: string): Promise<string>;
  diffBetween(ref1: string, ref2: string): Promise<string>;
  diffBetween(ref1: string, ref2: string, path: string): Promise<string>;
  show(ref: string, path: string): Promise<string>;
}

export interface LogOptions {
  maxEntries?: number;
  path?: string;
  from?: string;
  reverse?: boolean;
}

export interface GitCommit {
  readonly hash: string;
  readonly message: string;
  readonly parents: string[];
  readonly authorDate?: Date;
  readonly authorName?: string;
  readonly authorEmail?: string;
  readonly commitDate?: Date;
}
