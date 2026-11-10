import { BoundingBox, Color } from "excalibur";

export function outline(box: BoundingBox, ctx: unknown): void {
  box.debug(ctx);
  box.debug(ctx, { color: Color.Red });
}
