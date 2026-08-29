import { Actor } from "excalibur";

export function where(actor: Actor) {
  const pos = actor.getGlobalPos();
  const rot = actor.getGlobalRotation();
  const scale = actor.getGlobalScale();
  return { pos, rot, scale };
}
