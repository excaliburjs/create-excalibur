import { Particle, vec } from "excalibur";

export const spark = new Particle({
  particleLife: 3000,
  fadeFlag: true,
  acceleration: vec(0, 80),
  minVel: 10,
  maxVel: 50,
});
