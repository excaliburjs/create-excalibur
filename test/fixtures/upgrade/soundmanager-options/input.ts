import { SoundManager, SoundConfig } from 'excalibur';
import { Sound } from 'excalibur';

const Resources = {
  Music1: new Sound('./music1.ogg'),
  Jump: new Sound('./jump.wav'),
  Hit: new Sound('./hit.wav'),
};
const click = new Sound('./click.wav');

export const soundManager = new SoundManager({
  channels: ['fx', 'music'],
  sounds: {
    music1: { sound: Resources.Music1, volume: 0.5, channels: ['music'] },
    jump: { sound: Resources.Jump, volume: 1.0, channels: ['fx']},
    hit: {
      sound: Resources.Hit,
      channels: [],
    },
    bare: Resources.Jump,
    click,
  },
});

export const extra: SoundConfig<'fx'> = { sound: click, channels: ['fx'] };
soundManager.track('late', { sound: click, channels: ['fx'] });
