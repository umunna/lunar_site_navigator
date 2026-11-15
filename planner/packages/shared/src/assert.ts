// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.

/** Thrown when an internal precondition or invariant is violated. A bug, not user input. */
export class InvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvariantError';
  }
}

/**
 * Executable assertion (P10 rule 5). Used for parameter checks (rule 7) and
 * for invariants that must hold on every call. Never compiled out.
 */
export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new InvariantError(message);
  }
}

/** Assert that `value` is a finite number within [min, max]. */
export function assertRange(value: number, min: number, max: number, name: string): void {
  invariant(Number.isFinite(value), `${name} must be finite, got ${String(value)}`);
  invariant(value >= min && value <= max, `${name} must be in [${String(min)}, ${String(max)}], got ${String(value)}`);
}
