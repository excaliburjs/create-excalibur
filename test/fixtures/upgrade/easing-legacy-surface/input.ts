import { Actor, EaseTo, EasingFunction, isLegacyEasing, linear } from "excalibur";

export function tween(actor: Actor, easing: EasingFunction): void {
  if (isLegacyEasing(easing)) {
    console.log("legacy");
  }
  const action = new EaseTo(actor, 10, 20, 500, easing);
  console.log(action, linear(0.5));
}
