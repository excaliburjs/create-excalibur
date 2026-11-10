import { Actor, EnterTriggerEvent, ExitTriggerEvent } from "excalibur";

export function onEnter(evt: EnterTriggerEvent, hero: Actor): boolean {
  return evt.entity === hero;
}
export function onExit(evt: ExitTriggerEvent): void {
  evt.entity.kill();
}
export const unrelated = { actor: 1 }.actor;
