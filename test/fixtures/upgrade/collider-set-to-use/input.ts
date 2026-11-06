import { Actor, Colliders } from "excalibur";

const registry = new Map<string, number>();
export function fit(actor: Actor): void {
  actor.collider.set(Colliders.Box(32, 32));
  registry.set("a", 1); // a Map, not a ColliderComponent
}
