import { Actor, EventTypes as E } from "excalibur";

export function wire(actor: Actor): void {
  actor.events.on("kill", () => {});
  const k: "kill" = "kill";
  const p: "pointerup" = "pointerup";
  actor.events.emit(k, p);
  // ex-upgrade(event-types-to-strings): ex.EventTypes was removed in v1 — use the event name strings ('kill', 'pointerup', …) directly — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  for (const key of Object.values(E)) actor.events.off(key as string);
}
