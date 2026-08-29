import { HintedError, type HintedErrorOptions } from "../errors.ts";

export class DocsError extends HintedError {
  constructor(message: string, opts?: HintedErrorOptions) {
    super(message, opts);
    this.name = "DocsError";
  }
}

export class DocsNetworkError extends DocsError {
  constructor(message: string, opts?: HintedErrorOptions) {
    super(message, opts);
    this.name = "DocsNetworkError";
  }
}

export class DocsNotFoundError extends DocsError {
  constructor(message: string, opts?: HintedErrorOptions) {
    super(message, opts);
    this.name = "DocsNotFoundError";
  }
}
