import { Actor } from "excalibur";

export function nap(actor: Actor): boolean {
  if (!actor.body.sleeping) {
    actor.body.sleeping = true;
  }
  const bed = { sleeping: false };
  return actor.body.sleeping && !bed.sleeping;
}
