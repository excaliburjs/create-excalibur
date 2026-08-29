import { HintedError, type HintedErrorOptions } from "../errors.ts";

export class GenerateError extends HintedError {
  constructor(message: string, opts?: HintedErrorOptions) {
    super(message, opts);
    this.name = "GenerateError";
  }
}

/** A wiring insertion point could not be found — downgrade to manual instructions. */
export class SeamNotFoundError extends GenerateError {
  constructor(message: string, opts?: HintedErrorOptions) {
    super(message, opts);
    this.name = "SeamNotFoundError";
  }
}
