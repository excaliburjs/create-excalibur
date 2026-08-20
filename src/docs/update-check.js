import * as path from "node:path";
import { readFileSync } from "node:fs";
import { getChalk } from "../console.js";
import { cacheRoot, readJsonSync, writeJsonAtomic } from "./cache.js";

const CHECK_TTL_MS = 24 * 60 * 60 * 1000; // once a day
const REGISTRY_URL = "https://registry.npmjs.org/create-excalibur/latest";

function checkStatePath() {
  return path.join(cacheRoot(), "update-check.json");
}

export function currentVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/** True when `a` is a newer semver than `b`. Handles prerelease tags loosely. */
export function isNewer(a, b) {
  if (!a || !b) return false;
  const parse = (v) => {
    const [core, pre] = String(v).replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
  };
  const va = parse(a);
  const vb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (va.nums[i] ?? 0) - (vb.nums[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  // Same core: a release beats a prerelease; otherwise compare prerelease strings.
  if (va.pre === vb.pre) return false;
  if (va.pre === null) return true;
  if (vb.pre === null) return false;
  return va.pre.localeCompare(vb.pre, "en", { numeric: true }) > 0;
}

/**
 * Print a one-line gray hint when a newer create-excalibur is on the registry.
 * Checks the registry at most once a day; never throws, never blocks longer than ~2s.
 */
export async function maybeNotifyUpdate({ print = console.error } = {}) {
  try {
    const installed = currentVersion();
    if (!installed) return;

    let state = readJsonSync(checkStatePath());
    if (!state || Date.now() - Date.parse(state.checkedAt) > CHECK_TTL_MS) {
      const res = await fetch(REGISTRY_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return;
      const latest = (await res.json())?.version;
      if (!latest) return;
      state = { checkedAt: new Date().toISOString(), latest };
      await writeJsonAtomic(checkStatePath(), state);
    }

    if (isNewer(state.latest, installed)) {
      print(
        getChalk().gray(`Update available: create-excalibur ${installed} → ${state.latest}  (npm i -g create-excalibur)`)
      );
    }
  } catch {
    /* offline / registry hiccup — stay quiet */
  }
}
