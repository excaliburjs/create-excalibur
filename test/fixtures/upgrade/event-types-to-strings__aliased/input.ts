import { Actor, EventTypes as E, kill as K, pointerup as P } from "excalibur";

export function wire(actor: Actor): void {
  actor.events.on(E.Kill, () => {});
  const k: K = "kill";
  const p: P = "pointerup";
  actor.events.emit(k, p);
  for (const key of Object.values(E)) actor.events.off(key as string);
}
