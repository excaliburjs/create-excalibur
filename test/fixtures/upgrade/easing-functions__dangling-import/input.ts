import * as ex from 'excalibur';
import { EasingFunctions, Vector } from 'excalibur';

export function glide(actor: ex.Actor, target: Vector): void {
  actor.actions.moveTo({ pos: target, duration: 500, easing: EasingFunctions.EaseInOutCubic });
}
