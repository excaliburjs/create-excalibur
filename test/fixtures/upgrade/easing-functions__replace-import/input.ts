import { Actor, EasingFunctions, vec } from 'excalibur';

export function bounce(actor: Actor): void {
  actor.actions.moveBy({ offset: vec(0, -40), duration: 200, easing: EasingFunctions.EaseOutQuad });
  actor.actions.moveBy({ offset: vec(0, 40), duration: 200, easing: EasingFunctions.EaseInQuad });
  actor.actions.moveTo({ pos: vec(0, 0), duration: 100, easing: EasingFunctions.EaseInQuad });
}
