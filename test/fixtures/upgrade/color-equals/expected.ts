import { Color } from "excalibur";

export function isRed(color: Color): boolean {
  return color.equals(Color.Red) || Color.Red.equals(color);
}

export class Pair {
  equal(other: Pair): boolean { return other === this; } // a user method: untouched
}
export const same = new Pair().equal(new Pair());
