import { Animation, SpriteSheet, Timer, TimerOptions } from "excalibur";

export function build(sheet: SpriteSheet, fcn: () => void): void {
  const timer = new Timer({
    action: () => console.log("tick"),
    interval: 100,
    repeats: true,
  });
  const shorthand = new Timer({ action: fcn, interval: 50 });
  const quoted = new Timer({ "action": fcn, interval: 10 });
  const typed: TimerOptions = { action: fcn, interval: 5 };
  const viaTyped = new Timer(typed);
  const mine = { fcn, interval: 1 };
  // ex-upgrade(options-key-renames): new Timer(...) options use `fcn`, removed in v1 — rename it to `action` where this object is built — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  const viaMine = new Timer(mine);
  const anim = Animation.fromSpriteSheetCoordinates({
    spriteSheet: sheet,
    frameCoordinates: [{ x: 0, y: 0 }],
    durationPerFrame: 100,
  });
  const walk = Animation.fromSpriteSheet(sheet, [0, 1], 100);
  timer.start();
  console.log(shorthand, quoted, viaTyped, viaMine, anim, walk);
}
