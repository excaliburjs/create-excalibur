import { Engine, Input } from "excalibur";

export function poll(engine: Engine, kb: Input.Keyboard): boolean {
  if (engine.input.keyboard.wasPressed(Input.Keys.Space)) {
    return true;
  }
  const button: Input.PointerButton = Input.PointerButton.Left;
  return button === Input.PointerButton.Right;
}
