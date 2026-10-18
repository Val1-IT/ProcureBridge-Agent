export class ExpectedRevisionConflict extends Error {
  readonly code = "EXPECTED_REVISION_CONFLICT" as const;
  constructor(readonly currentRevision: number) {
    super("Expected ERP revision does not match the locked workspace revision.");
    this.name = "ExpectedRevisionConflict";
  }
}

export class PersistenceIntegrityError extends Error {
  readonly code = "PERSISTENCE_INTEGRITY" as const;
  constructor(message: string) {
    super(message);
    this.name = "PersistenceIntegrityError";
  }
}

export class IdempotencyKeyReusedError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REUSED" as const;
  constructor(message = "Idempotency key was reused with a different request.") {
    super(message);
    this.name = "IdempotencyKeyReusedError";
  }
}

export function isPostgresError(error: unknown): error is { code: string } {
  return Boolean(error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string");
}
