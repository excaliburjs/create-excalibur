import { PauseComponent, type PauseComponentOptions } from "excalibur";
import * as ex from "excalibur";

export const opts: PauseComponentOptions = { canPause: false };
export const pc = new PauseComponent(opts);
export function make(o: ex.PauseComponentOptions): ex.PauseComponent {
  return new ex.PauseComponent(o);
}
