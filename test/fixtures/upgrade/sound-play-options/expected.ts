import { Sound } from "excalibur";

const jump = new Sound("./jump.wav");
const music = new Sound("./music.ogg");

export function land(): void {
  jump.play({ volume: 0.5 });
  jump.play();
  jump.play({ volume: 0.25 });
  // ex-upgrade(sound-play-options): Sound.scheduledStartTime was removed in v1 (0.32 never read it) — pass play({ scheduledStartTime: 1000 }) instead
}
export function skip(sound: Sound, volume: number): void {
  sound.play({ volume });
  sound.seek(10);
  sound.resume();
}
