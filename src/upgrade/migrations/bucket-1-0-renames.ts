/**
 * v1 export renames (verified against core main 2026-11-02; none of the
 * casing fixes are in the CHANGELOG). The deprecated-alias ones (`Pool`,
 * `Shape`, `ActorArgs`, `ParticleEmitterArgs`) still compile on v1 — they
 * are tagged `version: "1.0.0"` because that is where the deprecation
 * landed, and ride the same factory as the hard removals so a project
 * leaves v1 upgrade with no deprecation warnings to chase.
 */
import { exportRenameMigration } from "./_export-rename.ts";

const V1 = "https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md";

/** `ex.Pool` → `ex.ArenaPool` (core 8e88cd48; `Pool` survives as a deprecated subclass). */
export const poolToArenaPool = exportRenameMigration({
  id: "pool-to-arenapool",
  version: "1.0.0",
  title: "Pool is deprecated in v1 — renamed to ArenaPool",
  link: V1,
  renames: { Pool: "ArenaPool" },
});

/** `Shape.Box/Circle/Polygon/Edge/Capsule` → `Colliders.*` (same statics; `Shape` is a deprecated alias). */
export const shapeToColliders = exportRenameMigration({
  id: "shape-to-colliders",
  version: "1.0.0",
  title: "Shape.* collider factories are deprecated in v1 — use Colliders.*",
  link: V1,
  renames: { Shape: "Colliders" },
});

/** The `*Args` option types gained `*Options` names (`ActorArgs` is a deprecated alias on v1). */
export const argsToOptionsTypes = exportRenameMigration({
  id: "actor-args-to-options",
  version: "1.0.0",
  title: "ActorArgs/ParticleEmitterArgs are deprecated in v1 — use ActorOptions/ParticleEmitterOptions",
  link: V1,
  renames: { ActorArgs: "ActorOptions", ParticleEmitterArgs: "ParticleEmitterOptions" },
});

/**
 * Casing fixes with NO deprecated alias (core 8b9be850 + the Screen rename):
 * the event classes, and the keys on the `ActorEvents`/`ScreenEvents` consts
 * (the event *strings* — 'enterviewport', 'fullscreen' — did not change).
 */
export const viewportEventCasing = exportRenameMigration({
  id: "viewport-event-casing",
  version: "1.0.0",
  title: "EnterViewPortEvent/ExitViewPortEvent/FullScreenChangeEvent were renamed (lowercase p/s) in v1",
  link: V1,
  renames: {
    EnterViewPortEvent: "EnterViewportEvent",
    ExitViewPortEvent: "ExitViewportEvent",
    FullScreenChangeEvent: "FullscreenChangeEvent",
  },
  staticMembers: {
    ActorEvents: { EnterViewPort: "EnterViewport", ExitViewPort: "ExitViewport" },
    ScreenEvents: { FullScreenChange: "FullscreenChange" },
  },
});

/** The text-direction enum (`ltr`/`rtl`) was renamed; `FontOptions.direction` keeps its key. */
export const directionToTextDirection = exportRenameMigration({
  id: "direction-to-textdirection",
  version: "1.0.0",
  title: "the Direction enum (text ltr/rtl) was renamed TextDirection in v1",
  link: V1,
  renames: { Direction: "TextDirection" },
});

/**
 * `WebAudioInstance` → `SoundTrack` (core 7206a977). Type positions are a
 * pure rename; `new WebAudioInstance(buffer)` is not — SoundTrack's
 * constructor takes (buffer, destination, onPlay?) and tracks are meant to
 * come from `sound.start()` / `sound.instances`.
 */
export const webAudioInstanceToSoundTrack = exportRenameMigration({
  id: "webaudioinstance-to-soundtrack",
  version: "1.0.0",
  title: "WebAudioInstance was replaced by SoundTrack in v1",
  link: V1,
  renames: { WebAudioInstance: "SoundTrack" },
  manualOnNew:
    "WebAudioInstance was removed in v1 — tracks are created by sound.start()/play() (see sound.instances); SoundTrack's constructor needs (buffer, destination, onPlay?)",
});
