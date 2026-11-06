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
  sounds: [
    { name: 'music1', sound: Resources.Music1, volume: 0.5, channel: 'music' },
    { name: 'jump', sound: Resources.Jump, volume: 1.0, channel: 'fx'},
    { name: 'hit',
      sound: Resources.Hit,
    },
    { name: 'bare', sound: Resources.Jump },
    { name: 'click', sound: click },
  ],
});

export const extra: SoundConfig<'fx'> = { sound: click, channel: 'fx' };
soundManager.track('late', { sound: click, channel: 'fx' });
