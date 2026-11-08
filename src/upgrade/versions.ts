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
 * The migration bucket the ORIGINAL v1 prerelease line maps to. Before core
 * flipped its `exNextVersion`, `next` tracked main as `0.33.0-alpha.x` — that
 * line IS v1, so anything on 0.33 runs the 1.0.0 migrations even though the
 * package version says 0.33. Kept as one constant so the mapping has a
 * single home. Later prerelease lines (`1.1.0-alpha.N`, …) carry their own
 * release number and map to it — see bucketFor().
 */
export const V1_MIGRATION_VERSION = "1.0.0";

/** Serialize a parsed version back to its canonical string. */
export function formatVersion(parsed: ParsedVersion): string {
  return `${parsed.major}.${parsed.minor}.${parsed.patch}${parsed.pre.length ? "-" + parsed.pre.join(".") : ""}`;
}

/**
 * The registry bucket a TARGET version selects migrations against:
 *  - the `0.33.x-*` prerelease line → `1.0.0` (it was v1 before the rename);
 *  - any other prerelease → its own release number (`1.1.0-alpha.313` runs
 *    everything up to and including the 1.1.0 bucket — the alphas of a
 *    release carry that release's changes as they land);
 *  - a release → itself.
 * Applied to the target ONLY. The installed version (`from`) stays raw on
 * purpose: a project on `0.33.0-alpha.224` must still receive the 1.0.0
 * records that landed in core after that alpha (`0.33.0-alpha.224 < 1.0.0`
 * keeps them in the window; bucketing `from` to 1.0.0 would skip them).
 */
export function bucketFor(version: string | ParsedVersion): string {
  const parsed = typeof version === "string" ? parseVersion(version) : version;
  if (!parsed) throw new GenerateError(`cannot bucket version "${version}"`);
  if (parsed.major === 0 && parsed.minor >= 33) return V1_MIGRATION_VERSION;
  if (parsed.pre.length === 0) return formatVersion(parsed);
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

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
  // Core's alpha line moved from 0.33.0-alpha.x to 1.1.0-alpha.x (exNextVersion
  // 1.1.0) on 2026-11-02; the pin is the newest alpha verified at that time.
  next: { version: "1.1.0-alpha.313", npmSpec: "next", migrationVersion: "1.1.0" },
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
   * `version` (a prerelease runs its release's bucket; the 0.33.0-alpha.*
   * line runs 1.0.0). Absent means `version` is the bucket. See bucketFor().
   */
  migrationVersion?: string;
}

/** Attach `migrationVersion` only when the bucket differs from the version itself. */
function withBucket(version: string, npmSpec: string): UpgradeTarget {
  const bucket = bucketFor(version);
  return bucket === version ? { version, npmSpec } : { version, npmSpec, migrationVersion: bucket };
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
 * it (`"excalibur": "1.1.0-alpha.313"`), never the floating tag: a dist-tag
 * committed into package.json means every later `npm install` on any machine
 * silently gets a different engine. The migration bucket is the prerelease's
 * release number (bucketFor). Offline the pin is unknowable, so the fallback
 * keeps the old behavior — writes `next` — and says so through `warn`,
 * rather than inventing a version. A `next` tag that trails the newest
 * published prerelease (seen live: `next` → 0.33.0-alpha.245 while
 * 1.1.0-alpha.313 was already published) is honored but flagged.
 */
export async function resolveNextTarget(
  fetchDistTags: FetchDistTags = defaultFetchDistTags,
  warn?: WarnSink
): Promise<UpgradeTarget> {
  try {
    const tags = await fetchDistTags();
    const version = tags?.next;
    if (typeof version === "string" && parseVersion(version)) {
      const newest = newestPrerelease(tags);
      if (newest && compareVersions(newest, version) > 0) {
        warn?.(
          `the npm \`next\` dist-tag points at ${version} but ${newest} is already published — using ${version}; pass --to ${newest} to target the newest prerelease.`
        );
      }
      return withBucket(version, version);
    }
  } catch {
    // offline / rate-limited / registry hiccup — fall through to the pin
  }
  warn?.(
    'could not resolve the `next` dist-tag from the npm registry — wrote the floating tag "next" to package.json; pin it to the exact version after `npm install` (npm ls excalibur) so installs stay reproducible.'
  );
  return { ...KNOWN_TARGETS.next };
}

/**
 * The newest prerelease the registry's dist-tags document (the tag doc only
 * carries tags, so "published but untagged" is invisible here; callers that
 * fetch the full package doc can pass its `versions` keys as extra tags).
 */
function newestPrerelease(tags: Record<string, string> | null | undefined): string | null {
  let best: string | null = null;
  for (const value of Object.values(tags ?? {})) {
    const parsed = parseVersion(value);
    if (!parsed || parsed.pre.length === 0) continue;
    if (best === null || compareVersions(parsed, best) > 0) best = formatVersion(parsed);
  }
  return best;
}

/**
 * `rawTo` is the --to value: "latest" (default), "next", "v1"/"1", or exact
 * semver. `v1`/`1` mean "the v1 line": the stable release once `latest` is on
 * major 1, the `next` prerelease until then. `1.0.0` is an exact target like
 * any other version — it was an alias for `next` while v1 only existed as a
 * prerelease, which would install a 1.1.0 alpha once 1.0.0 ships.
 */
export async function resolveTarget(
  rawTo: string | null | undefined,
  opts: { fetchDistTags?: FetchDistTags; warn?: WarnSink } = {}
): Promise<UpgradeTarget> {
  const to = (rawTo ?? "latest").trim().toLowerCase();
  if (to === "latest") return resolveLatestTarget(opts.fetchDistTags);
  if (to === "next") return resolveNextTarget(opts.fetchDistTags, opts.warn);
  if (to === "v1" || to === "1") {
    const latest = await resolveLatestTarget(opts.fetchDistTags);
    if ((parseVersion(latest.version)?.major ?? 0) >= 1) return latest;
    return resolveNextTarget(opts.fetchDistTags, opts.warn);
  }
  const parsed = parseVersion(to);
  if (!parsed) {
    throw new GenerateError(`unrecognized --to target "${rawTo}"`, {
      hint: 'use "latest", "next" (the prerelease line), or an exact version like 1.0.0.',
    });
  }
  const version = formatVersion(parsed);
  // A prerelease is pinned EXACTLY (`^1.1.0-alpha.313` would float across
  // alphas — the same non-reproducibility `next` is pinned to avoid); a
  // release gets the usual caret. Either way the bucket comes from bucketFor,
  // so `--to 0.33.0-alpha.224` selects what `--to next` did when that was next.
  return withBucket(version, parsed.pre.length ? version : `^${version}`);
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

/**
 * Does a dependency RANGE admit `version`? Hand-rolled for the ranges plugins
 * actually write (`~0.30.1`, `^1.0.0`, `>=0.32.0`, `~0.30 || ~0.31`, `*`):
 * `||` alternatives of space-separated comparators with `^ ~ >= > <= < =`
 * or a bare (possibly partial, `1.x`) version. npm's prerelease rule holds —
 * a prerelease only satisfies a comparator set naming a prerelease of the
 * same major.minor.patch. Returns null when the range is not understood,
 * so callers warn on `false` only.
 */
export function rangeAdmits(range: string, version: string): boolean | null {
  const v = parseVersion(version);
  if (!v) return null;
  const alternatives = range
    .split("||")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (alternatives.length === 0) return null;
  let understood = false;
  for (const alternative of alternatives) {
    const result = comparatorSetAdmits(alternative, v);
    if (result === null) continue;
    understood = true;
    if (result) return true;
  }
  return understood ? false : null;
}

const COMPARATOR = /^(\^|~|>=|<=|>|<|=)?v?(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z-.]+))?$/;

function comparatorSetAdmits(set: string, v: ParsedVersion): boolean | null {
  if (set === "*" || set === "x" || set === "X" || set === "latest") return true;
  const parts = set.split(/\s+/);
  let prereleaseAllowed = false;
  for (const part of parts) {
    const m = part.match(COMPARATOR);
    if (!m) return null;
    const op = m[1] ?? "";
    const major = Number(m[2]);
    const minor = m[3] && /^\d+$/.test(m[3]) ? Number(m[3]) : null;
    const patch = m[4] && /^\d+$/.test(m[4]) ? Number(m[4]) : null;
    const pre = m[5] ? m[5].split(".") : [];
    const base: ParsedVersion = { major, minor: minor ?? 0, patch: patch ?? 0, pre };
    if (pre.length > 0 && base.major === v.major && base.minor === v.minor && base.patch === v.patch) prereleaseAllowed = true;
    const cmp = compareVersions(v, base);
    const below = (upper: ParsedVersion) => compareVersions(v, upper) < 0;
    let ok: boolean;
    switch (op) {
      case ">=":
        ok = cmp >= 0;
        break;
      case ">":
        ok = cmp > 0;
        break;
      case "<=":
        ok = cmp <= 0;
        break;
      case "<":
        ok = cmp < 0;
        break;
      case "~":
        ok = cmp >= 0 && below(minor === null ? { major: major + 1, minor: 0, patch: 0, pre: [] } : { major, minor: minor + 1, patch: 0, pre: [] });
        break;
      case "^":
        ok =
          cmp >= 0 &&
          below(
            major > 0 || minor === null
              ? { major: major + 1, minor: 0, patch: 0, pre: [] }
              : minor > 0 || patch === null
                ? { major: 0, minor: minor + 1, patch: 0, pre: [] }
                : { major: 0, minor, patch: patch + 1, pre: [] }
          );
        break;
      default: // bare / "=": exact, or a partial `1` / `1.2` / `1.x` prefix
        ok = minor === null ? v.major === major : patch === null ? v.major === major && v.minor === minor : cmp === 0;
    }
    if (!ok) return false;
  }
  if (v.pre.length > 0 && !prereleaseAllowed) return false;
  return true;
}
