export interface HintedErrorOptions {
  hint?: string;
  cause?: unknown;
}

/**
 * Base for user-facing errors that carry an actionable `hint` line.
 * DocsError, GenerateError, and ScaffoldError all subclass this; anything
 * that needs "does this error have a hint?" should check `instanceof
 * HintedError`, not the concrete classes.
 */
export class HintedError extends Error {
  hint?: string;
  constructor(message: string, { hint, cause }: HintedErrorOptions = {}) {
    super(message, { cause });
    this.name = "HintedError";
    this.hint = hint;
  }
}
