export class GenerateError extends Error {
  constructor(message, { hint, cause } = {}) {
    super(message, { cause });
    this.name = "GenerateError";
    this.hint = hint;
  }
}

/** A wiring insertion point could not be found — downgrade to manual instructions. */
export class SeamNotFoundError extends GenerateError {
  constructor(message, opts) {
    super(message, opts);
    this.name = "SeamNotFoundError";
  }
}
