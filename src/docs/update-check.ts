import * as path from "node:path";
import { getChalk } from "../console.ts";
import { ownPackageJson } from "../pkg-info.ts";
import { cacheRoot, readJsonSync, writeJsonAtomic } from "./cache.ts";

const CHECK_TTL_MS = 24 * 60 * 60 * 1000; // once a day
const REGISTRY_URL = "https://registry.npmjs.org/create-excalibur/latest";

interface UpdateCheckState {
  checkedAt: string;
  latest: string;
}

function checkStatePath(): string {
  return path.join(cacheRoot(), "update-check.json");
}

export function currentVersion(): string | null {
  return ownPackageJson()?.version ?? null;
}

/** True when `a` is a newer semver than `b`. Handles prerelease tags loosely. */
export function isNewer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const parse = (v: string) => {
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
export async function maybeNotifyUpdate({ print = console.error }: { print?: (message: string) => void } = {}): Promise<void> {
  try {
    const installed = currentVersion();
    if (!installed) return;

    let state = readJsonSync<UpdateCheckState>(checkStatePath());
    if (!state || Date.now() - Date.parse(state.checkedAt) > CHECK_TTL_MS) {
      const res = await fetch(REGISTRY_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return;
      const latest = ((await res.json()) as { version?: string } | null)?.version;
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
