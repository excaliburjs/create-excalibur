import { Actor, ActorEvents, EnterViewportEvent, ExitViewportEvent, FullscreenChangeEvent, ScreenEvents } from "excalibur";

export class Blip extends Actor {
  onEnter(evt: EnterViewportEvent): void {}
  onExit(evt: ExitViewportEvent): void {}
  wire(): void {
    this.events.on(ActorEvents.EnterViewport, (evt: EnterViewportEvent) => this.onEnter(evt));
    this.events.on(ActorEvents.ExitViewport, (evt) => this.onExit(evt));
    this.events.on(ActorEvents.Kill, () => {});
  }
}
export function onFullscreen(evt: FullscreenChangeEvent): string {
  return ScreenEvents.FullscreenChange;
}
