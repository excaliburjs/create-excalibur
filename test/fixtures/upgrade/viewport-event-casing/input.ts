import { Actor, ActorEvents, EnterViewPortEvent, ExitViewPortEvent, FullScreenChangeEvent, ScreenEvents } from "excalibur";

export class Blip extends Actor {
  onEnter(evt: EnterViewPortEvent): void {}
  onExit(evt: ExitViewPortEvent): void {}
  wire(): void {
    this.events.on(ActorEvents.EnterViewPort, (evt: EnterViewPortEvent) => this.onEnter(evt));
    this.events.on(ActorEvents.ExitViewPort, (evt) => this.onExit(evt));
    this.events.on(ActorEvents.Kill, () => {});
  }
}
export function onFullscreen(evt: FullScreenChangeEvent): string {
  return ScreenEvents.FullScreenChange;
}
