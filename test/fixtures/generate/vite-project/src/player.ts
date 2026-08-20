import { Actor, Collider, CollisionContact, Engine, Side, vec } from "excalibur";
import { Resources } from "./resources";

export class Player extends Actor {
  constructor() {
    super({
      name: 'Player',
      pos: vec(150, 150),
      width: 100,
      height: 100,
    });
  }

  override onInitialize() {
    this.graphics.add(Resources.Sword.toSprite());
  }

  override onPreUpdate(engine: Engine, elapsedMs: number): void {
    // Put any update logic here runs every frame before Actor builtins
  }

  override onCollisionStart(self: Collider, other: Collider, side: Side, contact: CollisionContact): void {
    // Called when a pair of objects are in contact
  }
}
