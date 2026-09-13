import { Actor, EasingFunctions, Scene, vec, easeInOutCubic, easeOutQuad, linear } from "excalibur";

export function glide(actor: Actor, scene: Scene): void {
  actor.actions.moveTo({ pos: vec(100, 200), duration: 500, easing: easeInOutCubic });
  actor.actions.moveBy({ offset: vec(10, 0), duration: 250, easing: linear });
  scene.camera.move(vec(0, 0), 300, easeOutQuad);
  // ex-upgrade(easing-functions): EasingFunctions.EaseInQuad(...) is called with the legacy 4-arg signature (removed in v1) — the flat easeInQuad(t) only maps 0..1; lerp the result yourself — https://github.com/excaliburjs/Excalibur/releases/tag/v0.32.0
  const halfway = EasingFunctions.EaseInQuad(250, 0, 100, 500);
  // ex-upgrade(easing-functions): EasingFunctions.EaseInCubic flows into non-excalibur code (removed in v1) — pass the flat easeInCubic and retype consumers from EasingFunction to Easing — https://github.com/excaliburjs/Excalibur/releases/tag/v0.32.0
  const mine = EasingFunctions.EaseInCubic;
  console.log(halfway, mine);
}
