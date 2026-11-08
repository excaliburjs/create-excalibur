import { Loadable, Resource } from "excalibur";

// A plugin-style custom resource (excalibur-tiled / aseprite / spritefusion all look like this).
export class TiledResource implements Loadable<string> {
  data!: string;
  private _resource = new Resource<string>("./map.json", "json");
  async load(): Promise<string> {
    if (this.isLoaded) return this.data;
    return (this.data = await this._resource.load());
  }
  get isLoaded(): boolean {
    return this._resource.isLoaded;
  }
}

export class Lazy extends TiledResource {
  override get isLoaded(): boolean {
    return false;
  }
}

export const inline: Loadable<number> = {
  data: 1,
  load: async () => 1,
  get isLoaded() { return true; },
};
