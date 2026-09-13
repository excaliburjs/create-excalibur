import { Actor, GraphicsComponent, IsometricMap } from "excalibur";

class Menu {
  visible = true;
}

export function toggle(actor: Actor, iso: IsometricMap, menu: Menu): void {
  actor.graphics.visible = !actor.graphics.visible;
  iso.visible = false;
  menu.visible = false;
  const gfx = new GraphicsComponent({ visible: false, opacity: 1 });
  if (gfx.visible) {
    console.log("shown");
  }
}
