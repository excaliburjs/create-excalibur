import { Actor, Sprite } from "excalibur";

export function skin(actor: Actor, sprite: Sprite): void {
  actor.graphics.show(sprite);
}
export const slideshow = { show(item: unknown) {} };
slideshow.show("photo"); // user show — untouched
