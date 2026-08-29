import { memberRenameMigration } from "./_member-rename.ts";
import type * as TS from "typescript";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V030 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0";

export const gotoToGoToScene = memberRenameMigration({
  id: "goto-to-gotoscene",
  version: "0.30.0",
  title: "Engine.goto(...) was removed — use goToScene(...)",
  link: V030,
  receivers: new Set(["Engine"]),
  members: { goto: "goToScene" },
});

export const graphicsShowToUse = memberRenameMigration({
  id: "graphics-show-to-use",
  version: "0.30.0",
  title: "GraphicsComponent.show(...) was removed — use use(...)",
  link: V030,
  receivers: new Set(["GraphicsComponent"]),
  members: { show: "use" },
});

export const vectorSizeToMagnitude = memberRenameMigration({
  id: "vector-size-to-magnitude",
  version: "0.30.0",
  title: "Vector.size is deprecated (removed in v1) — use magnitude",
  link: V030,
  receivers: new Set(["Vector"]),
  members: { size: "magnitude" },
});

export const getGlobalAccessors = memberRenameMigration({
  id: "get-global-accessors",
  version: "0.30.0",
  title: "getGlobalPos()/getGlobalRotation()/getGlobalScale() are deprecated — use the accessors",
  link: V030,
  receivers: new Set(["Actor", "TransformComponent", "Entity"]),
  members: {
    getGlobalPos: "globalPos",
    getGlobalRotation: "globalRotation",
    getGlobalScale: "globalScale",
  },
  callToAccessor: true,
});
