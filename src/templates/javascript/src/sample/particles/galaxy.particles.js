import { Color, EmitterType, ParticleEmitter, Vector } from 'excalibur';

// https://excaliburjs.com/docs/particles
// https://excaliburjs.com/particle-tester/
export function create_galaxy(setup) {
  const { width, height, x, y } = setup;
  const emitter = new ParticleEmitter({
    width,
    height,
    x,
    y,
  });
  emitter.emitterType = EmitterType.Circle;
  emitter.radius = 375;
  emitter.minVel = 414;
  emitter.maxVel = 380;
  emitter.minAngle = 0;
  emitter.maxAngle = 5.2;
  emitter.isEmitting = true;
  emitter.emitRate = 594;
  emitter.opacity = 0.87;
  emitter.fadeFlag = true;
  emitter.particleLife = 6175;
  emitter.maxSize = 2;
  emitter.minSize = 1;
  emitter.startSize = 0;
  emitter.endSize = 152;
  emitter.acceleration = new Vector(514, 2000);
  emitter.beginColor = Color.Transparent;
  emitter.endColor = Color.Transparent;

  return emitter;
}
