export class DocsError extends Error {
  constructor(message, { hint, cause } = {}) {
    super(message, { cause });
    this.name = "DocsError";
    this.hint = hint;
  }
}

export class DocsNetworkError extends DocsError {
  constructor(message, opts) {
    super(message, opts);
    this.name = "DocsNetworkError";
  }
}

export class DocsNotFoundError extends DocsError {
  constructor(message, opts) {
    super(message, opts);
    this.name = "DocsNotFoundError";
  }
}
