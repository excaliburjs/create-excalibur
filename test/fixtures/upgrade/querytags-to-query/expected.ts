import { Entity, Scene, TagQuery, World } from "excalibur";

export class Level extends Scene {
  // ex-upgrade(querytags-to-query): the TagQuery type was removed in v1 — world.query({ tags }) returns a Query — https://github.com/excaliburjs/Excalibur/blob/main/site/docs/100-migrations.mdx
  private enemies!: TagQuery;

  onInitialize(): void {
    // ex-upgrade(querytags-to-query): queryTags([...]) was removed in v1 — use world.query({ tags: { all: [...] } }) (query([...]) takes component constructors, not tags); the result still has .getEntities() — https://github.com/excaliburjs/Excalibur/blob/main/site/docs/100-migrations.mdx
    this.enemies = this.world.queryTags(["enemy"]);
    // ex-upgrade(querytags-to-query): TagQuery was removed in v1 — use world.query({ tags: { all: [...] } }), which returns a Query — https://github.com/excaliburjs/Excalibur/blob/main/site/docs/100-migrations.mdx
    const bosses = new TagQuery(["boss"]);
    const all = this.world.query({ tags: { all: ["enemy"] } });
    console.log(bosses, all);
  }

  living(): Entity[] {
    return this.enemies.getEntities();
  }
}

export function scan(world: World): Entity[] {
  // ex-upgrade(querytags-to-query): queryTags([...]) was removed in v1 — use world.query({ tags: { all: [...] } }) (query([...]) takes component constructors, not tags); the result still has .getEntities() — https://github.com/excaliburjs/Excalibur/blob/main/site/docs/100-migrations.mdx
  return world.queryTags(["pickup"]).getEntities();
}
