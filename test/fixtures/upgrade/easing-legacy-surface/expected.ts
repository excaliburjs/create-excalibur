import { Actor, EaseTo, EasingFunction, isLegacyEasing, linear } from "excalibur";

// ex-upgrade(easing-legacy-surface): the EasingFunction type (4-arg legacy easing) was removed in v1 — use Easing, i.e. (t: number) => number — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
export function tween(actor: Actor, easing: EasingFunction): void {
  // ex-upgrade(easing-legacy-surface): isLegacyEasing() was removed in v1 — only (t: number) => number easings remain; drop the branch — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  if (isLegacyEasing(easing)) {
    console.log("legacy");
  }
  // ex-upgrade(easing-legacy-surface): new EaseTo(...) is no longer exported in v1 — use new MoveToWithOptions(entity, { pos, duration, easing }) or actions.moveTo({...}) — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  const action = new EaseTo(actor, 10, 20, 500, easing);
  console.log(action, linear(0.5));
}
