import { Actor, Entity } from "excalibur";

export function prune(entities: Entity[], player: Actor): Entity[] {
  player.active = false;
  const awake = player.body.active;
  const router = { active: true };
  if (router.active) {
    return entities.filter((e) => e.active);
  }
  return awake ? entities : [];
}
