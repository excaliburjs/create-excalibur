import { Actor, Shape, vec } from "excalibur";
import * as ex from "excalibur";

export function fit(actor: Actor): void {
  actor.collider.use(Shape.Box(32, 32));
  actor.collider.use(Shape.Circle(16));
  actor.collider.use(ex.Shape.Polygon([vec(0, 0), vec(1, 0), vec(0, 1)]));
}
