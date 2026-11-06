import { Actor, type ActorOptions, ParticleEmitterOptions } from "excalibur";
import * as ex from "excalibur";

export interface HeroArgs extends ActorOptions {
  speed: number;
}
export class Hero extends Actor {
  constructor(args: HeroArgs) {
    super(args);
  }
}
export const emitterConfig: ParticleEmitterOptions = { emitRate: 10 };
export function build(args: ex.ActorOptions): Actor {
  return new Actor(args);
}
