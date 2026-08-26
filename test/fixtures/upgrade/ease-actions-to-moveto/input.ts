import { Actor, EasingFunctions } from "excalibur";

export function glide(actor: Actor): void {
  actor.actions.easeTo(100, 200, 500, EasingFunctions.EaseInOutCubic);
  actor.actions.easeBy(10, 0, 250);
}
