import { Actor, PreUpdateEvent, PostUpdateEvent } from "excalibur";

export class Hero extends Actor {
  constructor() { super({ name: "hero" }); }
  wire(): void {
    this.on("preupdate", (evt: PreUpdateEvent) => {
      const step = evt.elapsed / 1000;
      void step;
    });
    this.on("postupdate", ({ elapsed: delta }: PostUpdateEvent) => {
      void delta;
    });
  }
}
export const physics = { delta: 16 }; // user field named delta — untouched
export const d = physics.delta;
