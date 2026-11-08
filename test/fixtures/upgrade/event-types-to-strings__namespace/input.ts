import * as ex from 'excalibur';
import { Actor, EventTypes } from 'excalibur';

export function wire(actor: Actor): void {
  actor.events.on(ex.EventTypes.PreUpdate, () => {});
  actor.events.on(ex.EventTypes.ExitTrigger, () => {});
  const handler = (name: ex.pointerdown) => name;
  handler('pointerdown');
  for (const key of Object.values(EventTypes)) actor.events.off(key as string);
}
