import { TileMap } from "excalibur";

export const ground = new TileMap({
  rows: 20,
  columns: 30,
  tileWidth: 16,
  tileHeight: 16,
  compositeStrategy: 'together',
});
