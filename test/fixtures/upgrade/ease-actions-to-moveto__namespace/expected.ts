import * as ex from "excalibur";

export function glide(actor: ex.Actor): void {
  actor.actions.moveTo({ pos: ex.vec(100, 200), duration: 500 });
  actor.actions.moveBy({ offset: ex.vec(10, 0), duration: 250 });
}
