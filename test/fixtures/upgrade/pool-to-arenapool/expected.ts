import { ArenaPool, vec, Vector } from "excalibur";
import * as ex from "excalibur";

class Pool2 {} // a user class named like the export must never rename
export const own = new Pool2();
export const vectors = new ArenaPool<Vector>(() => vec(0, 0), (v) => v, 100);
export const viaNamespace: ex.ArenaPool<number> = new ex.ArenaPool(() => 0);
export class Arena extends ArenaPool<string> {}
