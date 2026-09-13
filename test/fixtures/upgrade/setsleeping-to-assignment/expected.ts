import { Actor } from "excalibur";

export function rest(actor: Actor, others: Actor[]): void {
  actor.body.isSleeping = true;
  // ex-upgrade(setsleeping-to-assignment): setSleeping() was removed in v1 — assign body.isSleeping = <value> as its own statement — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  others.forEach((o) => o.body.setSleeping(false));
  actor.body.isSleeping = !actor.body.isSleeping;
}
