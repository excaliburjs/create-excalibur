import { Entity, Scene, TagQuery, World } from "excalibur";

export class Level extends Scene {
  private enemies!: TagQuery;

  onInitialize(): void {
    this.enemies = this.world.queryTags(["enemy"]);
    const bosses = new TagQuery(["boss"]);
    const all = this.world.query({ tags: { all: ["enemy"] } });
    console.log(bosses, all);
  }

  living(): Entity[] {
    return this.enemies.getEntities();
  }
}

export function scan(world: World): Entity[] {
  return world.queryTags(["pickup"]).getEntities();
}
