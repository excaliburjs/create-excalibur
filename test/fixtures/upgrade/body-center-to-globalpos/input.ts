import { Actor, Engine, TileMap } from "excalibur";

export function where(actor: Actor, engine: Engine, map: TileMap): void {
  const bodyCenter = actor.body.center;
  const actorCenter = actor.center;
  const screenCenter = engine.screen.center;
  const mapCenter = map.center;
  const box = { center: bodyCenter };
  console.log(bodyCenter, actorCenter, screenCenter, mapCenter, box.center);
}
