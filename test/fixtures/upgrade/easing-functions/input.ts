import { Actor, EasingFunctions, Scene, vec } from "excalibur";

export function glide(actor: Actor, scene: Scene): void {
  actor.actions.moveTo({ pos: vec(100, 200), duration: 500, easing: EasingFunctions.EaseInOutCubic });
  actor.actions.moveBy({ offset: vec(10, 0), duration: 250, easing: EasingFunctions.Linear });
  scene.camera.move(vec(0, 0), 300, EasingFunctions.EaseOutQuad);
  const halfway = EasingFunctions.EaseInQuad(250, 0, 100, 500);
  const mine = EasingFunctions.EaseInCubic;
  console.log(halfway, mine);
}
