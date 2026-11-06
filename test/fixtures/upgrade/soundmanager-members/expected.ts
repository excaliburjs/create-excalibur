import { SoundManager, ChannelCollection, Sound } from "excalibur";

export function tune(manager: SoundManager<"fx" | "music", "jump">, sound: Sound): void {
  manager.volume = 0.5;
  const muted = manager.isMuted(sound);
  manager.setChannel("jump", "fx");
  manager.setChannel("jump", null);
  manager.play("jump", { volume: 0.25 });
  manager.channel.play("jump", { volume: 1 });
  if (manager.getSound("jump") == undefined) {
    return;
  }
  const channels = new ChannelCollection(manager);
  console.log(muted, channels);
}
