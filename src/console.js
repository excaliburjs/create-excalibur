import { Chalk } from "chalk";

export const customChalk = new Chalk({ level: 2 });

export const log = console.log;
export function info(message) {
  log(customChalk.bgBlue(message));
}
export function warn(message) {
  log(customChalk.yellow(message));
}
export function alert(message) {
  log(customChalk.bgRed(message));
}
export function success(message) {
  log(customChalk.greenBright(message));
}
//
export function textBlue(text) {
  return customChalk.blue(text);
}
export function textGray(text) {
  return customChalk.gray(text);
}
