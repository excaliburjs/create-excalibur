import { Sound } from "excalibur";

const jump = new Sound("./jump.wav");
const music = new Sound("./music.ogg");

export function land(): void {
  jump.play(0.5);
  jump.play();
  jump.play({ volume: 0.25 });
  music.scheduledStartTime = 1000;
}
export function skip(sound: Sound, volume: number): void {
  sound.play(volume);
  sound.seek(10);
  sound.play();
}
