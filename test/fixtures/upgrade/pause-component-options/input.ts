import { PauseComponent, type PauseComponentInterface } from "excalibur";
import * as ex from "excalibur";

export const opts: PauseComponentInterface = { canPause: false };
export const pc = new PauseComponent(opts);
export function make(o: ex.PauseComponentInterface): ex.PauseComponent {
  return new ex.PauseComponent(o);
}
