import { BoundingBox, Color } from "excalibur";

export function outline(box: BoundingBox, ctx: unknown): void {
  box.draw(ctx);
  box.draw(ctx, Color.Red);
}
