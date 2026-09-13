import { Actor, easeInQuad, easeOutQuad, vec } from 'excalibur';

export function bounce(actor: Actor): void {
  actor.actions.moveBy({ offset: vec(0, -40), duration: 200, easing: easeOutQuad });
  actor.actions.moveBy({ offset: vec(0, 40), duration: 200, easing: easeInQuad });
  actor.actions.moveTo({ pos: vec(0, 0), duration: 100, easing: easeInQuad });
}
