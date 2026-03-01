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

## 구현 예정 핸들러

| 토픽 | 파일 | Phase |
|------|------|-------|
| `/app/vscode/edit/find` | `FindHandler.ts` | Phase 3 |
| `/app/vscode/edit/replace` | `ReplaceHandler.ts` | Phase 3 |
| `/app/vscode/nav/definition` | `DefinitionHandler.ts` | Phase 4 |
| `/app/vscode/nav/references` | `ReferencesHandler.ts` | Phase 4 |
