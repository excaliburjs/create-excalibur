import { Chalk } from "chalk";
import ora from "ora";

const customChalk = new Chalk({ level: 2 });

export const terminal = {
  padding: {
    title: " ".repeat(1),
    subtitle: " ".repeat(3),
    itemList: " ".repeat(4),
  },
  spinner: function (text) {
    return ora(text).start();
  },
  title: function (text, color) {
    console.log(terminal.padding.title, color(text));
  },
  subtitle: function (text, color = textWhite) {
    console.log(terminal.padding.subtitle, color(text));
  },
  listItem: function (item) {
    const { text, textRelevant, colorRelevant = textBlue } = item;
    console.log(
      terminal.padding.itemList,
      "-",
      textGray(text),
      colorRelevant(textRelevant)
    );
  },
  blank: () => console.log(""),
  line: (symbol = "-") => console.log(symbol.repeat(65)),
  print: (text, color = textWhite) => console.log(color(text)),
  warning: function (text) {
    console.log(customChalk.bgYellow.underline.bold(text));
  },
};
//
export function success(text) {
  return customChalk.bgGreenBright(text);
}
export function textYellow(text) {
  return customChalk.yellow(text);
}
export function textBlue(text) {
  return customChalk.blue(text);
}
export function textGray(text) {
  return customChalk.gray(text);
}
export function textWhite(text) {
  return customChalk.whiteBright(text);
}
export function textMagenta(text) {
  return customChalk.magenta(text);
}
