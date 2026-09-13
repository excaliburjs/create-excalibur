import { Buttons, Engine, Gamepad } from "excalibur";

export function jumpHeld(engine: Engine, pad: Gamepad): boolean {
  const first = engine.input.gamepads.at(0);
  const custom = { isButtonPressed: (_b: Buttons) => false };
  return pad.isButtonHeld(Buttons.Face1) || first.isButtonHeld(Buttons.Face2, 0.5) || custom.isButtonPressed(Buttons.Face1);
}
