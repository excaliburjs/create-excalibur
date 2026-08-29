import { Chalk, type ChalkInstance } from "chalk";
import ora, { type Ora } from "ora";

/** A chalk-style colorizer: text in, ANSI-wrapped text out. */
export type ColorFn = (text: string) => string;

export interface ListItem {
  text: string;
  textRelevant: string;
  colorRelevant?: ColorFn;
}

function defaultColorLevel(): 0 | 2 {
  if ("NO_COLOR" in process.env && process.env.NO_COLOR !== "") return 0;
  if (process.env.FORCE_COLOR === "0") return 0;
  return 2;
}

let customChalk = new Chalk({ level: defaultColorLevel() });

/** Override the color level (0 = no colors). Used by `--no-color`. */
export function setColorLevel(level: 0 | 1 | 2 | 3): void {
  customChalk = new Chalk({ level });
}
/** The shared chalk instance (respects setColorLevel / NO_COLOR). */
export function getChalk(): ChalkInstance {
  return customChalk;
}

export const terminal = {
  padding: {
    title: " ".repeat(1),
    subtitle: " ".repeat(3),
    itemList: " ".repeat(4),
  },
  spinner: function (text: string): Ora {
    return ora(text).start();
  },
  title: function (text: string, color: ColorFn): void {
    console.log(terminal.padding.title, color(text));
  },
  subtitle: function (text: string, color: ColorFn = textWhite): void {
    console.log(terminal.padding.subtitle, color(text));
  },
  listItem: function (item: ListItem): void {
    const { text, textRelevant, colorRelevant = textBlue } = item;
    console.log(
      terminal.padding.itemList,
      "-",
      textGray(text),
      colorRelevant(textRelevant)
    );
  },
  blank: (): void => console.log(""),
  line: (symbol = "-"): void => console.log(symbol.repeat(65)),
  print: (text: string, color: ColorFn = textWhite): void => console.log(color(text)),
  warning: function (text: string): void {
    console.log(customChalk.bgYellow.underline.bold(text));
  },
};
//
export function success(text: string): string {
  return customChalk.bgGreenBright(text);
}
export function textYellow(text: string): string {
  return customChalk.yellow(text);
}
export function textBlue(text: string): string {
  return customChalk.blue(text);
}
export function textGray(text: string): string {
  return customChalk.gray(text);
}
export function textWhite(text: string): string {
  return customChalk.whiteBright(text);
}
export function textMagenta(text: string): string {
  return customChalk.magenta(text);
}
