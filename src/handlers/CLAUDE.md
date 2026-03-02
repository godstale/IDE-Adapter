# src/handlers/

토픽 문자열 → `IHandler` 구현체 매핑 레이어.

## HandlerRegistry.ts

**역할**: 핸들러 등록 및 조회 (단순 Map 래퍼)

```typescript
register(topic: string, handler: IHandler): void
get(topic: string): IHandler | undefined
topics(): string[]   // 등록된 토픽 목록 → 핸드셰이크 capabilities에 사용
```

## 새 핸들러 추가 방법

1. `src/handlers/<Name>Handler.ts` 생성
2. `IHandler` (from `../protocol/types.js`) 구현:
   ```typescript
   export class NameHandler implements IHandler {
     async handle(params: Record<string, unknown>): Promise<Record<string, unknown>> {
       // vscode.* API 호출
       return { ... };
     }
   }
   ```
3. `src/extension.ts`의 `activate()`에서 등록:
   ```typescript
   registry.register('/app/vscode/category/action', new NameHandler());
   ```
4. `docs/IDEA_InputProtocol.md` / `docs/IDEA_OutputProtocol.md` 업데이트

## 현재 구현된 핸들러

| 토픽 | 파일 | 설명 |
|------|------|------|
| `/app/vscode/edit/find` | `FindHandler.ts` | 텍스트/정규식 검색 |
| `/app/vscode/edit/replace` | `ReplaceHandler.ts` | 텍스트 교체 |
| `/app/vscode/nav/definition` | `DefinitionHandler.ts` | 심볼 정의 이동 |
| `/app/vscode/nav/references` | `ReferencesHandler.ts` | 심볼 참조 목록 |
| `/app/vscode/diag/list` | `DiagnosticHandler.ts` | 파일 진단(오류·경고) |
| `/app/vscode/nav/symbols` | `SymbolHandler.ts` | 파일 내 심볼 목록 |
| `/app/vscode/history/list` | `FileHistoryHandler.ts` | git 커밋 이력 목록 |
| `/app/vscode/history/diff` | `FileDiffHandler.ts` | 두 커밋 간 unified diff |
| `/app/vscode/history/rollback` | `FileRollbackHandler.ts` | 특정 커밋으로 파일 복원 |
| `/app/vscode/fs/findFiles` | `FileSearchHandler.ts` | 파일명 키워드 검색 |
| `/app/vscode/localhistory/list` | `LocalHistoryListHandler.ts` | VS Code 로컬 저장 이력 목록 |
| `/app/vscode/localhistory/diff` | `LocalHistoryDiffHandler.ts` | 두 로컬 저장 시점 간 diff |
| `/app/vscode/localhistory/rollback` | `LocalHistoryRollbackHandler.ts` | 특정 로컬 저장 시점으로 복원 |

## LocalHistoryService.ts

Git 기반 핸들러와 달리 LocalHistory 3개 핸들러는 공유 서비스를 통해 동작합니다.

```typescript
class LocalHistoryService
  constructor(globalStoragePath: string)  // context.globalStorageUri.fsPath
  listEntries(filePath: string): Promise<LocalHistoryEntry[]>
  getContent(entryId: string, filePath: string): Promise<string>
```

`extension.ts`에서 `LocalHistoryService` 인스턴스를 생성하여 3개 핸들러에 주입합니다.

## 경로 처리 패턴

모든 핸들러는 `filePath` 파라미터에서 상대경로·절대경로 모두 수용합니다.
워크스페이스 루트 기준 상대경로는 `vscode.workspace.workspaceFolders[0].uri.fsPath`를 기준으로 해석합니다.

## Git Extension API 타입

`src/types/git.d.ts` — `vscode.git` Extension이 내보내는 타입 선언:
`GitExtension`, `GitAPI`, `GitRepository`, `GitCommit`, `LogOptions`
