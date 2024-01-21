import { Color, EmitterType, ParticleEmitter, Vector } from 'excalibur';
import { ParticleSetup } from '../models';

// https://excaliburjs.com/docs/particles
// https://excaliburjs.com/particle-tester/
export function create_galaxy(setup: ParticleSetup) {
  const { width, height, x, y } = setup;
  const emitter = new ParticleEmitter({
    width,
    height,
    x,
    y,
  });
  emitter.emitterType = EmitterType.Circle;
  emitter.radius = 375;
  emitter.minVel = 400;
  emitter.maxVel = 415;
  emitter.minAngle = 0;
  emitter.maxAngle = 5.2;
  emitter.isEmitting = true;
  emitter.emitRate = 300;
  emitter.opacity = 0.8;
  emitter.fadeFlag = true;
  emitter.particleLife = 3000;
  emitter.maxSize = 1;
  emitter.minSize = 1;
  emitter.startSize = 1;
  emitter.endSize = 1;
  emitter.acceleration = new Vector(514, 2000);
  emitter.beginColor = Color.Transparent;
  emitter.endColor = Color.Transparent;

  return emitter;
}
