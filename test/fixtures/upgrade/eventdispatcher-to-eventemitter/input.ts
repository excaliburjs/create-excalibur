import { EventDispatcher } from "excalibur";

export class Bus {
  private dispatcher: EventDispatcher = new EventDispatcher();
  send(): void {
    this.dispatcher.emit("ping");
  }
}
