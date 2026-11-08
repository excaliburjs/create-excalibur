import { Direction } from "excalibur";
import * as ex from "excalibur";

export const rtl = Direction.rtl;
export function pick(dir: ex.Direction): boolean {
  return dir === ex.Direction.ltr;
}
