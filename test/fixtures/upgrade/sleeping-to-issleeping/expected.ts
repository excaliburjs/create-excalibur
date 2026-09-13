import { Actor } from "excalibur";

export function nap(actor: Actor): boolean {
  if (!actor.body.isSleeping) {
    actor.body.isSleeping = true;
  }
  const bed = { sleeping: false };
  return actor.body.isSleeping && !bed.sleeping;
}
