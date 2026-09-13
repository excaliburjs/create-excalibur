import { Actor, Entity } from "excalibur";

export function prune(entities: Entity[], player: Actor): Entity[] {
  player.isActive = false;
  const awake = player.body.isActive;
  const router = { active: true };
  if (router.active) {
    return entities.filter((e) => e.isActive);
  }
  return awake ? entities : [];
}
