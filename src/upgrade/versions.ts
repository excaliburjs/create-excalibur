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
 * The migration bucket the v1 prerelease line maps to. Excalibur's `next`
 * dist-tag tracks main as `0.33.0-alpha.x` — that line IS v1, so anything
 * resolving to 0.33+ runs the 1.0.0 migrations even though the package
 * version says 0.33. Kept as one constant so the mapping has a single home.
 */
export const V1_MIGRATION_VERSION = "1.0.0";

/**
 * Maintained targets (like the curated plugin list precedent). Both entries
 * are last-verified-at-ship PINS used only as the OFFLINE FALLBACK for the
 * resolve*Target() functions below — the live registry dist-tags are the
 * source of truth, since a pin goes stale the moment excalibur ships again
 * (a stale `latest` would silently undershoot; a stale `next` would write a
 * floating dist-tag into package.json, which the v1 migration pass found
 * made 17/17 manifests non-reproducible — see resolveNextTarget).
 */
export const KNOWN_TARGETS = {
  latest: { version: "0.32.0", npmSpec: "^0.32.0" },
  next: { version: "1.0.0", npmSpec: "next", migrationVersion: V1_MIGRATION_VERSION },
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
  /** the excalibur version that will be installed — honest for display and package.json */
  version: string;
  npmSpec: string;
  /**
   * The registry bucket to select migrations against, when it differs from
   * `version` (the 0.33.0-alpha.* prerelease line runs the 1.0.0 bucket).
   * Absent means `version` is the bucket.
   */
  migrationVersion?: string;
}

export type FetchDistTags = () => Promise<Record<string, string> | null | undefined>;

/** Out-of-band channel for resolution caveats (run.ts routes these into summary.warnings). */
export type WarnSink = (message: string) => void;

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

/**
 * `--to next` resolves the live `next` dist-tag to an EXACT version and pins
 * it (`"excalibur": "0.33.0-alpha.224"`), never the floating tag: a dist-tag
 * committed into package.json means every later `npm install` on any machine
 * silently gets a different engine. The migration bucket stays 1.0.0 (see
 * V1_MIGRATION_VERSION). Offline the pin is unknowable, so the fallback keeps
 * the old behavior — writes `next` — and says so through `warn`, rather than
 * inventing a version.
 */
export async function resolveNextTarget(
  fetchDistTags: FetchDistTags = defaultFetchDistTags,
  warn?: WarnSink
): Promise<UpgradeTarget> {
  try {
    const tags = await fetchDistTags();
    const version = tags?.next;
    if (typeof version === "string" && parseVersion(version)) {
      return { version, npmSpec: version, migrationVersion: V1_MIGRATION_VERSION };
    }
  } catch {
    // offline / rate-limited / registry hiccup — fall through to the pin
  }
  warn?.(
    'could not resolve the `next` dist-tag from the npm registry — wrote the floating tag "next" to package.json; pin it to the exact version after `npm install` (npm ls excalibur) so installs stay reproducible.'
  );
  return { ...KNOWN_TARGETS.next };
}

/** True for the v1 prerelease line (0.33.0-alpha.* tracks main). */
function isV1Prerelease(parsed: ParsedVersion): boolean {
  return parsed.major === 0 && parsed.minor >= 33;
}

/** `rawTo` is the --to value: "latest" (default), "next", "v1"/"1", or exact semver. */
export async function resolveTarget(
  rawTo: string | null | undefined,
  opts: { fetchDistTags?: FetchDistTags; warn?: WarnSink } = {}
): Promise<UpgradeTarget> {
  const to = (rawTo ?? "latest").trim().toLowerCase();
  if (to === "latest") return resolveLatestTarget(opts.fetchDistTags);
  if (to === "next" || to === "v1" || to === "1" || to === "1.0.0" || to === "v1.0.0") {
    return resolveNextTarget(opts.fetchDistTags, opts.warn);
  }
  const parsed = parseVersion(to);
  if (!parsed) {
    throw new GenerateError(`unrecognized --to target "${rawTo}"`, {
      hint: 'use "latest", "next" (v1 prerelease), or an exact version like 0.32.0.',
    });
  }
  const version = `${parsed.major}.${parsed.minor}.${parsed.patch}${parsed.pre.length ? "-" + parsed.pre.join(".") : ""}`;
  // An explicit `--to 0.33.0-alpha.224` must select the same bucket `--to next` does.
  const migrationVersion = isV1Prerelease(parsed) ? V1_MIGRATION_VERSION : undefined;
  return migrationVersion ? { version, npmSpec: `^${version}`, migrationVersion } : { version, npmSpec: `^${version}` };
}

/**
 * Migrations selected for a (from, to] hop, in registry (ascending) order:
 * those whose `version` falls in the window, PLUS those deprecated before
 * `from` whose `removedIn` falls in the window — the old API stops working in
 * this hop, so the codemod is mandatory even though the deprecation release
 * is "already done".
 */
export function migrationPath<M extends { version: string; removedIn?: string }>(migrations: M[], from: string, to: string): M[] {
  const inWindow = (v: string) => compareVersions(v, from) > 0 && compareVersions(v, to) <= 0;
  return migrations.filter((m) => inWindow(m.version) || (m.removedIn !== undefined && inWindow(m.removedIn)));
}

/**
 * Migrations at or below `from` — the ones the window skips as already done.
 * The runner checks these read-only to catch code that never got migrated
 * (a project that jumped versions without running the intermediate codemods).
 */
export function migrationBacklog<M extends { version: string }>(migrations: M[], from: string): M[] {
  return migrations.filter((m) => compareVersions(m.version, from) <= 0);
}

/**
 * The `--from` value that re-opens the window for a backlog item at
 * `version`: the highest registry bucket strictly below it, or the floor the
 * registry starts from. (`from` is exclusive, so `--from <version>` itself
 * would still skip it.)
 */
export function fromForBacklog(version: string, registryVersions: Iterable<string>, floor = "0.29.3"): string {
  let best: string | null = null;
  for (const v of registryVersions) {
    if (compareVersions(v, version) < 0 && (best === null || compareVersions(v, best) > 0)) best = v;
  }
  return best ?? floor;
}
