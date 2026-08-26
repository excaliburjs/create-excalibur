import { Actor, EasingFunctions, vec } from "excalibur";

export function glide(actor: Actor): void {
  actor.actions.moveTo({ pos: vec(100, 200), duration: 500, easing: EasingFunctions.EaseInOutCubic });
  actor.actions.moveBy({ offset: vec(10, 0), duration: 250 });
}
