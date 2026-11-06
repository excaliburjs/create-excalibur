import { Sound, SoundTrack } from "excalibur";

export function first(sound: Sound): SoundTrack | undefined {
  return sound.instances[0] as SoundTrack | undefined;
}
export function fresh(buffer: AudioBuffer): SoundTrack {
  // ex-upgrade(webaudioinstance-to-soundtrack): WebAudioInstance was removed in v1 — tracks are created by sound.start()/play() (see sound.instances); SoundTrack's constructor needs (buffer, destination, onPlay?) — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  return new WebAudioInstance(buffer);
}
