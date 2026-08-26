import { Actor } from "excalibur";

export function where(actor: Actor) {
  const pos = actor.globalPos;
  const rot = actor.globalRotation;
  const scale = actor.globalScale;
  return { pos, rot, scale };
}
