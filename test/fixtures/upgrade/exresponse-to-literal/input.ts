import { ExResponse, Resource } from "excalibur";
import * as ex from "excalibur";

export const buffer = new Resource<ArrayBuffer>("./a.bin", ExResponse.type.arraybuffer);
export const blob = new Resource<Blob>("./a.png", ex.ExResponse.type.blob);
export const anything = new Resource<unknown>("./a", ExResponse.type.any);
export const viaIndex = new Resource<string>("./a.json", ExResponse.type['json']);
