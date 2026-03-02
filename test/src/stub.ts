// ─── Stub types for IDEA Adapter test suite ──────────────────────────────────

export interface IStubService {
  execute(input: string): string;
  cancel(): void;
}

export class StubServiceError {
  constructor(public readonly code: string, public readonly message: string) {}
}

export class StubServiceImpl implements IStubService {
  execute(input: string): string {
    return input;
  }

  cancel(): void {
    // no-op
  }
}

export function createStubService(): IStubService {
  return new StubServiceImpl();
}
