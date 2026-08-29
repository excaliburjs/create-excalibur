import { Particle, vec } from "excalibur";

export const spark = new Particle({
  life: 3000,
  fade: true,
  acc: vec(0, 80),
  minSpeed: 10,
  maxSpeed: 50,
});
