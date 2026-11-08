import { Actor, Engine, Trigger, GraphicsComponent, Tile, TileMap, PhysicsConfig, ActorOptions, Graph } from "excalibur";

export class Ghost extends Actor {
  constructor(visible: boolean) {
    super({ name: "ghost", visible });
  }
}

export const hidden = new Actor({ name: "hidden", visible: false });
export const trigger = new Trigger({ visible: true, pos: undefined });
export const gfx = new GraphicsComponent({ "visible": false, opacity: 1 });
export const tile = new Tile({ x: 0, y: 0, map: new TileMap({}), solid: true });
export const physics: PhysicsConfig = { enabled: true, integration: { onScreenOnly: true } }; // "on screen" keys are unchanged on v1
export const options: ActorOptions = { visible: true };
export const engine = new Engine({ physics: { integration: { onScreenOnly: false } } });
export const graph = new Graph<string>();
export const edges = graph.addEdge(graph.addNode("a"), graph.addNode("b"), { weight: 1, directed: true });

// not excalibur's keys: a user interface and a loose object
interface Panel { visible: boolean; solid?: boolean }
export const panel: Panel = { visible: true, solid: false };
export const loose = { visible: false, directed: true };
export const z = { solid: 3 };
