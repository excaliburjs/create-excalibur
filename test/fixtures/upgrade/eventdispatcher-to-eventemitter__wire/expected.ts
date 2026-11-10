import { Actor, EventEmitter } from "excalibur";

// ex-upgrade(eventdispatcher-to-eventemitter): EventEmitter's type argument is an event map ({ eventName: EventType }), not the target type EventDispatcher took — replace or drop it — https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0
export function link(a: EventEmitter<Actor>, b: EventEmitter): void {
  // ex-upgrade(eventdispatcher-to-eventemitter): EventDispatcher.wire(other) has no EventEmitter equivalent by that name — a.wire(b) forwarded b's events to a; write b.pipe(a) — https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0
  a.wire(b);
  // ex-upgrade(eventdispatcher-to-eventemitter): EventDispatcher.unwire(other) has no EventEmitter equivalent by that name — a.unwire(b) stopped forwarding b's events to a; write b.unpipe(a) — https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0
  a.unwire(b);
}
