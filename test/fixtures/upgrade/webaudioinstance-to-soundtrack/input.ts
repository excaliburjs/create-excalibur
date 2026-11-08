import { Sound, WebAudioInstance } from "excalibur";

export function first(sound: Sound): WebAudioInstance | undefined {
  return sound.instances[0] as WebAudioInstance | undefined;
}
export function fresh(buffer: AudioBuffer): WebAudioInstance {
  return new WebAudioInstance(buffer);
}
