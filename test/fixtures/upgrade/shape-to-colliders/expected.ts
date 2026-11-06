import { Actor, Colliders, vec } from "excalibur";
import * as ex from "excalibur";

export function fit(actor: Actor): void {
  actor.collider.use(Colliders.Box(32, 32));
  actor.collider.use(Colliders.Circle(16));
  actor.collider.use(ex.Colliders.Polygon([vec(0, 0), vec(1, 0), vec(0, 1)]));
}
