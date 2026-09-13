import * as ex from "excalibur";

export function glide(actor: ex.Actor, scene: ex.Scene): void {
  actor.actions.moveTo({ pos: ex.vec(100, 200), duration: 500, easing: ex.easeInOutCubic });
  scene.camera.zoomOverTime(2, 300, ex.easeOutCubic);
}
