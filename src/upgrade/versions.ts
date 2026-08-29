import { GenerateError } from "../generate/errors.ts";
import { requestJson } from "../docs/http.ts";

const NPM_REGISTRY = "https://registry.npmjs.org";

/**
 * Hand-rolled semver-enough parsing/compare (no semver dep in this repo).
 * Prerelease sorts BEFORE its release (1.0.0-alpha.1 < 1.0.0); prerelease
 * segments compare numeric-then-lexical, shorter list first (spec-ish, and
 * plenty for excalibur's alpha tags).
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

export function parseVersion(raw: unknown): ParsedVersion | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split(".") : [],
  };
}

export function compareVersions(a: string | ParsedVersion, b: string | ParsedVersion): number {
  const va = typeof a === "string" ? parseVersion(a) : a;
  const vb = typeof b === "string" ? parseVersion(b) : b;
  if (!va || !vb) throw new GenerateError(`cannot compare versions "${a}" and "${b}"`);
  for (const key of ["major", "minor", "patch"] as const) {
    if (va[key] !== vb[key]) return va[key] < vb[key] ? -1 : 1;
  }
  if (va.pre.length === 0 && vb.pre.length === 0) return 0;
  if (va.pre.length === 0) return 1; // release > its prerelease
  if (vb.pre.length === 0) return -1;
  const len = Math.max(va.pre.length, vb.pre.length);
  for (let i = 0; i < len; i++) {
    const sa = va.pre[i];
    const sb = vb.pre[i];
    if (sa === undefined) return -1; // shorter prerelease list sorts first
    if (sb === undefined) return 1;
    const na = /^\d+$/.test(sa) ? Number(sa) : null;
    const nb = /^\d+$/.test(sb) ? Number(sb) : null;
    if (na !== null && nb !== null) {
      if (na !== nb) return na < nb ? -1 : 1;
    } else if (na !== null) {
      return -1; // numeric < alphanumeric
    } else if (nb !== null) {
      return 1;
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Maintained targets (like the curated plugin list precedent). "next" is the
 * npm dist-tag tracking main — verified 2026-08: it exists and points at
 * 0.33.0-alpha.x. Its migration version is 1.0.0 so the v1 bucket runs.
 *
 * `latest` here is a last-verified-at-ship PIN, used only as the offline
 * fallback for resolveLatestTarget() below — the live registry dist-tag is
 * the source of truth, since this pin goes stale the moment excalibur ships
 * again and every default `ex upgrade` would silently undershoot.
 */
export const KNOWN_TARGETS = {
  latest: { version: "0.32.0", npmSpec: "^0.32.0" },
  next: { version: "1.0.0", npmSpec: "next" },
};

async function defaultFetchDistTags(): Promise<Record<string, string>> {
  return requestJson<Record<string, string>>(`${NPM_REGISTRY}/-/package/excalibur/dist-tags`, {
    headers: { Accept: "application/json", "User-Agent": "create-excalibur (ex upgrade)" },
  });
}

/**
 * `--to latest` resolves against the real npm dist-tag (one unauthenticated
 * GET, same pattern as docs/plugins.js's registry search) instead of a
 * hardcoded version — falls back to KNOWN_TARGETS.latest on any failure
 * (offline, rate-limited, registry hiccup) so `--to latest` still works,
 * just possibly stale. `fetchDistTags` is injectable for tests (network-free
 * per this repo's test policy — real fetch is the production default).
 */
export interface UpgradeTarget {
  version: string;
  npmSpec: string;
}

export type FetchDistTags = () => Promise<Record<string, string> | null | undefined>;

export async function resolveLatestTarget(fetchDistTags: FetchDistTags = defaultFetchDistTags): Promise<UpgradeTarget> {
  try {
    const tags = await fetchDistTags();
    const version = tags?.latest;
    if (typeof version === "string" && parseVersion(version)) {
      return { version, npmSpec: `^${version}` };
    }
  } catch {
    // offline / rate-limited / registry hiccup — use the last-known pin
  }
  return { ...KNOWN_TARGETS.latest };
}

/** `rawTo` is the --to value: "latest" (default), "next", "v1"/"1", or exact semver. */
export async function resolveTarget(rawTo: string | null | undefined, opts: { fetchDistTags?: FetchDistTags } = {}): Promise<UpgradeTarget> {
  const to = (rawTo ?? "latest").trim().toLowerCase();
  if (to === "latest") return resolveLatestTarget(opts.fetchDistTags);
  if (to === "next" || to === "v1" || to === "1" || to === "1.0.0" || to === "v1.0.0") {
    return { ...KNOWN_TARGETS.next };
  }
  const parsed = parseVersion(to);
  if (!parsed) {
    throw new GenerateError(`unrecognized --to target "${rawTo}"`, {
      hint: 'use "latest", "next" (v1 prerelease), or an exact version like 0.32.0.',
    });
  }
  const version = `${parsed.major}.${parsed.minor}.${parsed.patch}${parsed.pre.length ? "-" + parsed.pre.join(".") : ""}`;
  return { version, npmSpec: `^${version}` };
}

/** Migrations whose version falls in (from, to], in registry (ascending) order. */
export function migrationPath<M extends { version: string }>(migrations: M[], from: string, to: string): M[] {
  return migrations.filter(
    (m) => compareVersions(m.version, from) > 0 && compareVersions(m.version, to) <= 0
  );
}
