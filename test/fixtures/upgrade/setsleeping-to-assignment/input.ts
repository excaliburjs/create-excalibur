import { Actor } from "excalibur";

export function rest(actor: Actor, others: Actor[]): void {
  actor.body.setSleeping(true);
  others.forEach((o) => o.body.setSleeping(false));
  actor.body.setSleeping(!actor.body.isSleeping);
}
