import { Engine, Keyboard, Keys, PointerButton } from "excalibur";

export function poll(engine: Engine, kb: Keyboard): boolean {
  if (engine.input.keyboard.wasPressed(Keys.Space)) {
    return true;
  }
  const button: PointerButton = PointerButton.Left;
  return button === PointerButton.Right;
}
