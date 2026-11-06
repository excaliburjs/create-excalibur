import { SoundManager, ChannelCollection, Sound } from "excalibur";

export function tune(manager: SoundManager<"fx" | "music", "jump">, sound: Sound): void {
  manager.defaultVolume = 0.5;
  const muted = manager._isMuted(sound);
  manager.addChannel("jump", ["fx"]);
  manager.removeChannel("jump", ["fx", "music"]);
  manager.play("jump", 0.25);
  manager.channel.play("jump", 1);
  if (manager.getSound("jump") === undefined) {
    return;
  }
  const channels = new ChannelCollection({}, manager);
  console.log(muted, channels);
}
