/**
 * `@excaliburjs/*` plugin dependencies and the excalibur peer range each
 * installed copy declares. The upgrade bumps excalibur alone; a plugin whose
 * peer range excludes the target (plugin-tiled@0.30.1 → `~0.30.1`) stays
 * on the old API — on v1 its `isLoaded(): boolean` METHOD no longer
 * satisfies `Loadable`, so `tsc` fails and, worse, the DefaultLoader's
 * `!r.isLoaded` sees a truthy function and silently never loads the resource.
 * Seen on sample-ldtk, sample-tiled-vite and ludum-55 during calibration;
 * the runner used to report `warnings: []` and "upgrade complete".
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { rangeAdmits } from "./versions.ts";

export interface PluginPeer {
  name: string;
  /** the range package.json declares for the plugin */
  declared: string;
  /** installed version under node_modules, when present */
  installed: string | null;
  /** the installed plugin's `peerDependencies.excalibur`, when present */
  peerRange: string | null;
}

export interface PluginPeerCheck extends PluginPeer {
  /** null when the plugin is not installed, has no excalibur peer, or the range is not understood */
  admitsTarget: boolean | null;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function excaliburPluginPeers(projectDir: string): PluginPeer[] {
  const pkg = readJson(path.join(projectDir, "package.json"));
  if (!pkg) return [];
  const deps: Record<string, unknown> = {
    ...((pkg.dependencies as Record<string, unknown>) ?? {}),
    ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
  };
  const peers: PluginPeer[] = [];
  for (const [name, declared] of Object.entries(deps)) {
    if (!name.startsWith("@excaliburjs/") || typeof declared !== "string") continue;
    const installedPkg = readJson(path.join(projectDir, "node_modules", name, "package.json"));
    const installed = typeof installedPkg?.version === "string" ? installedPkg.version : null;
    const peer = (installedPkg?.peerDependencies as Record<string, unknown> | undefined)?.excalibur;
    peers.push({ name, declared, installed, peerRange: typeof peer === "string" ? peer : null });
  }
  return peers.sort((a, b) => a.name.localeCompare(b.name));
}

export function checkPluginPeers(projectDir: string, targetVersion: string | null): PluginPeerCheck[] {
  return excaliburPluginPeers(projectDir).map((p) => ({
    ...p,
    admitsTarget: p.peerRange && targetVersion ? rangeAdmits(p.peerRange, targetVersion) : null,
  }));
}

/** One warning per installed plugin whose excalibur peer range rejects the target. */
export function pluginPeerWarnings(projectDir: string, targetVersion: string | null): string[] {
  return checkPluginPeers(projectDir, targetVersion)
    .filter((p) => p.admitsTarget === false)
    .map(
      (p) =>
        `${p.name}@${p.installed} declares the excalibur peer range "${p.peerRange}", which does not admit ${targetVersion} — the plugin keeps the OLD api shape (its resources still declare isLoaded() as a method, so v1's loader silently never loads them). Upgrade the plugin too (\`npm view ${p.name} dist-tags\`) or expect type errors after installing.`
    );
}
