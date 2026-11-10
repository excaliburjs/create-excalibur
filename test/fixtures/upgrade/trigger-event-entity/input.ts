import { Actor, EnterTriggerEvent, ExitTriggerEvent } from "excalibur";

export function onEnter(evt: EnterTriggerEvent, hero: Actor): boolean {
  return evt.actor === hero;
}
export function onExit(evt: ExitTriggerEvent): void {
  evt.actor.kill();
}
export const unrelated = { actor: 1 }.actor;
