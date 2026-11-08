import * as ex from 'excalibur';
import { Actor, EventTypes } from 'excalibur';

export function wire(actor: Actor): void {
  actor.events.on('preupdate', () => {});
  actor.events.on('exit', () => {});
  const handler = (name: 'pointerdown') => name;
  handler('pointerdown');
  // ex-upgrade(event-types-to-strings): ex.EventTypes was removed in v1 — use the event name strings ('kill', 'pointerup', …) directly — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  for (const key of Object.values(EventTypes)) actor.events.off(key as string);
}
