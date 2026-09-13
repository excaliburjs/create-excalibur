import { Animation, SpriteSheet, Timer, TimerOptions } from "excalibur";

export function build(sheet: SpriteSheet, fcn: () => void): void {
  const timer = new Timer({
    fcn: () => console.log("tick"),
    interval: 100,
    repeats: true,
  });
  const shorthand = new Timer({ fcn, interval: 50 });
  const quoted = new Timer({ "fcn": fcn, interval: 10 });
  const typed: TimerOptions = { fcn, interval: 5 };
  const viaTyped = new Timer(typed);
  const mine = { fcn, interval: 1 };
  const viaMine = new Timer(mine);
  const anim = Animation.fromSpriteSheetCoordinates({
    spriteSheet: sheet,
    frameCoordinates: [{ x: 0, y: 0 }],
    durationPerFrameMs: 100,
  });
  const walk = Animation.fromSpriteSheet(sheet, [0, 1], 100);
  timer.start();
  console.log(shorthand, quoted, viaTyped, viaMine, anim, walk);
}
