import { Actor, type ActorArgs, ParticleEmitterArgs } from "excalibur";
import * as ex from "excalibur";

export interface HeroArgs extends ActorArgs {
  speed: number;
}
export class Hero extends Actor {
  constructor(args: HeroArgs) {
    super(args);
  }
}
export const emitterConfig: ParticleEmitterArgs = { emitRate: 10 };
export function build(args: ex.ActorArgs): Actor {
  return new Actor(args);
}
