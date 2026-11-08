import { TextDirection } from "excalibur";
import * as ex from "excalibur";

export const rtl = TextDirection.rtl;
export function pick(dir: ex.TextDirection): boolean {
  return dir === ex.TextDirection.ltr;
}
