import { Resource } from "excalibur";
import * as ex from "excalibur";

export const buffer = new Resource<ArrayBuffer>("./a.bin", "arraybuffer");
export const blob = new Resource<Blob>("./a.png", "blob");
export const anything = new Resource<unknown>("./a", "");
export const viaIndex = new Resource<string>("./a.json", 'json');
