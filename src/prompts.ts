/**
 * Prompt wrappers — the one place the CLI imports `@inquirer/prompts` from.
 *
 * Every prompt gets two things for free:
 *  - vim (`j`/`k`) + emacs (`Ctrl-N`/`Ctrl-P`) navigation by default (inquirer's
 *    `theme.keybindings`; a per-call `theme` still wins). Note inquirer disables
 *    `select`'s type-to-search under vim so the letters aren't eaten.
 *  - Esc cancels the prompt: it rejects with `PromptCancelled`, which flows let
 *    propagate to `main()` (back to the menu, or a quiet "cancelled" exit).
 *
 * Esc arrives as a lone `escape` keypress only after readline's escape-code
 * timeout (~500 ms), so arrow keys (`ESC [ B`) never trip it.
 */
import * as inquirer from "@inquirer/prompts";

export class PromptCancelled extends Error {
  override name = "PromptCancelled";
  constructor() {
    super("Prompt cancelled with Esc");
  }
}

export function isPromptCancelled(error: unknown): boolean {
  return error instanceof PromptCancelled;
}

/** Treats Esc, Ctrl-C and inquirer's own force-close the same way. */
export function isPromptExit(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return isPromptCancelled(error) || error.name === "ExitPromptError" || error.message.includes("User force closed");
}

export const DEFAULT_KEYBINDINGS: ReadonlyArray<"vim" | "emacs"> = ["vim", "emacs"];

type Context = NonNullable<Parameters<typeof inquirer.select>[1]>;
type KeypressInput = NodeJS.ReadableStream & { on(event: "keypress", listener: KeypressListener): unknown };
type KeypressListener = (chunk: unknown, key: { name?: string } | undefined) => void;
type AnyConfig = { theme?: object };
type PromptFn = (config: never, context?: Context) => Promise<unknown>;

function withDefaults<F extends PromptFn>(prompt: F): F {
  const wrapped = async (config: AnyConfig, context: Context = {}) => {
    const input = (context.input ?? process.stdin) as KeypressInput;
    const controller = new AbortController();
    const cancelled = new PromptCancelled();
    const onKeypress: KeypressListener = (_chunk, key) => {
      if (key?.name === "escape") controller.abort(cancelled);
    };
    if (context.signal) context.signal.addEventListener("abort", () => controller.abort(context.signal!.reason), { once: true });
    input.on("keypress", onKeypress);
    const theme = { keybindings: DEFAULT_KEYBINDINGS, ...(config.theme ?? {}) };
    try {
      return await (prompt as unknown as (c: AnyConfig, x: Context) => Promise<unknown>)(
        { ...config, theme },
        { ...context, signal: controller.signal }
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortPromptError" && error.cause === cancelled) throw cancelled;
      throw error;
    } finally {
      input.removeListener("keypress", onKeypress);
    }
  };
  return wrapped as unknown as F;
}

export const select: typeof inquirer.select = withDefaults(inquirer.select);
export const search: typeof inquirer.search = withDefaults(inquirer.search);
export const checkbox: typeof inquirer.checkbox = withDefaults(inquirer.checkbox);
export const confirm: typeof inquirer.confirm = withDefaults(inquirer.confirm);
export const input: typeof inquirer.input = withDefaults(inquirer.input);
export const number: typeof inquirer.number = withDefaults(inquirer.number);
