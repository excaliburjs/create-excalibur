import { EventEmitter } from "excalibur";

export class Bus {
  private dispatcher: EventEmitter = new EventEmitter();
  send(): void {
    this.dispatcher.emit("ping");
  }
}
