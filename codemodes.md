# `ex upgrade` codemods

Every record in `src/upgrade/registry.ts` (73), in the order they run, checked on 2026-11-10 against
published `excalibur@1.0.0` (gitHead `9c51454c`) and the published 0.29.3 / 0.30.0 / 0.31.0 / 0.32.0
typings.

**Kind**

- **auto** — rewrites code. Anything it cannot prove gets a breadcrumb instead.
- **manual** — leaves a `// ex-upgrade(<id>): …` breadcrumb above each site; no code change.
- **note** — one notification in the report; no code change.

**Since** is the release that deprecated or changed the API. `→ 1.0` means the old API kept working
until v1 removed it, so the record is re-selected for any project crossing into v1.

**Needed?** — every record targets an API that really existed and really changed; none is redundant
with another. The column only calls out the exceptions.

## 0.30.0

| id | kind | since | transformation | needed? |
|---|---|---|---|---|
| `input-namespace-flatten` | auto | 0.30 | `ex.Input.Keys` / `Input.Keys` → `ex.Keys` / `Keys` (+ import) for the 29 real namespace members; unknown members → breadcrumb | yes |
| `delta-to-elapsedms` | auto | 0.30 | `evt.delta` → `evt.elapsed`; `({ delta })` → `({ elapsed: delta })` on the six update/draw events | yes (the id says "elapsedms"; the rename is `elapsed`) |
| `goto-to-gotoscene` | auto | 0.30 | `engine.goto(…)` → `engine.goToScene(…)` | yes |
| `graphics-show-to-use` | auto | 0.30 | `graphics.show(…)` → `graphics.use(…)` | yes |
| `trigger-event-entity` | auto | 0.30 | `EnterTriggerEvent` / `ExitTriggerEvent` `.actor` → `.entity` | yes — **new**, was an uncovered gap |
| `vector-size-to-magnitude` | auto | 0.30 → 1.0 | `vector.size` → `vector.magnitude` | yes |
| `get-global-accessors` | auto | 0.30 → 1.0 | `actor.getGlobalPos()` / `getGlobalRotation()` / `getGlobalScale()` → `.globalPos` / `.globalRotation` / `.globalScale` | yes |
| `eventdispatcher-to-eventemitter` | auto | 0.30 | `EventDispatcher` → `EventEmitter` (import, `ex.X`, types, `new`); `wire` / `unwire` and `EventDispatcher<T>` type arguments → breadcrumb | yes |
| `antialiasing-accessors` | auto | 0.30 | `engine.getAntialiasing()` → `engine.screen.antialiasing`; `engine.setAntialiasing(x)` → `engine.screen.antialiasing = x` | yes |
| `particle-emitter-args` | auto | 0.30 | emitter keys: `particleSprite`→`graphic`, `particleRotationalVelocity`→`angularVelocity`, `fadeFlag`→`fade`, `acceleration`→`acc`, `particleLife`→`life`, `minVel`→`minSpeed`, `maxVel`→`maxSpeed`, `particleTransform`→`transform`; the `particle: { … }` nesting → breadcrumb | yes |
| `ease-actions-to-moveto` | auto | 0.30 → 1.0 | `easeTo(x, y, ms, fn?)` → `moveTo({ pos: vec(x, y), duration: ms, easing: fn })`; `easeBy` → `moveBy({ offset, … })`; Vector overload likewise; `ex.vec` under a namespace import | yes |
| `timer-option-bag` | auto | 0.30 | `new Timer(fn, interval, repeats?)` → `new Timer({ fcn: fn, interval, repeats })` | **marginal** — the positional form left the typings in 0.24, so it only fires on untyped / already-failing code. Harmless; `fcn` is carried on to `action` by `options-key-renames` |
| `screenshader-vtexcoord` | auto | 0.30 → 1.0 | `v_texcoord` → `v_uv` inside `new ScreenShader(…)` source strings | yes |
| `physics-statics` | manual | 0.30 | breadcrumb on `Physics.x` and `ex.Physics.x` (move into `new Engine({ physics })`) | yes |
| `collision-event-target` | manual | 0.30 | breadcrumb on `.on("collisionstart" …)` handlers and hooks that treat the participant as an Entity (read `.owner`) | yes |
| `system-priority-static` | manual | 0.30 | breadcrumb on an instance `priority` field in a `System` subclass (must be `static`) | yes — still compiles on 1.0.0 and is silently ignored |
| `trigger-api` | manual | 0.30 | breadcrumb on `new Trigger({ target, … })` (`target` now combines with `filter`) | yes |
| `vector-normalize-zero` | note | 0.30 | `normalize()` of a zero vector returns `(0,0)`, was `(0,1)` | yes |
| `actor-options-union` | manual | 0.30 | breadcrumb on `interface X extends ActorArgs` and on spreads next to `width`/`height`/`radius`/`collider` | yes |

## 0.32.0

| id | kind | since | transformation | needed? |
|---|---|---|---|---|
| `boundingbox-draw-to-debug` | auto | 0.32 → 1.0 | `box.draw(ctx)` → `box.debug(ctx)`; `box.draw(ctx, color)` → `box.debug(ctx, { color })` | yes |
| `physics-sleep-defaults` | note | 0.32 | Realistic-solver bodies sleep by default | yes |
| `easing-functions` | auto | 0.32 → 1.0 | `EasingFunctions.EaseInOutCubic` → `easeInOutCubic` (or `ex.easeInOutCubic`) where the value goes to an excalibur API, import fixed up; called / escaping uses → breadcrumb | yes |

## 1.0.0 — rendering, physics and member removals

| id | kind | transformation | needed? |
|---|---|---|---|
| `screen-coordinates-rooting` | manual | breadcrumb on `worldToScreenCoordinates` / `screenToWorldCoordinates` / `contentArea.left/top/topLeft` when a clipping display mode is used | yes |
| `tilemap-composite-strategy` | auto | `new TileMap({ … })` gains `compositeStrategy: 'together'` (the old default); note only for libraries | yes |
| `font-text-rendering` | note | text rasterises tighter in v1; names the line-spacing bug in 1.0.0 | yes |
| `visible-to-isvisible` | auto | `graphics.visible` / `isoMap.visible` → `.isVisible` | yes |
| `active-to-isactive` | auto | `entity.active` / `body.active` → `.isActive` | yes |
| `sleeping-to-issleeping` | auto | `body.sleeping` → `body.isSleeping` | yes |
| `setsleeping-to-assignment` | auto | `body.setSleeping(x);` → `body.isSleeping = x;` | yes |
| `body-center-to-globalpos` | auto | `body.center` → `body.globalPos` | yes |
| `fullscreen-casing` | auto | `screen.isFullScreen` → `isFullscreen`, `goFullScreen()` → `enterFullscreen()`, `exitFullScreen()` → `exitFullscreen()` | yes |
| `gamepad-isbuttonpressed` | auto | `pad.isButtonPressed(…)` → `pad.isButtonHeld(…)` | yes |
| `options-key-renames` | auto | `new Timer({ fcn })` → `{ action }`; `Animation.fromSpriteSheetCoordinates({ durationPerFrameMs })` → `{ durationPerFrame }` | yes |
| `querytags-to-query` | manual | breadcrumb on `world.queryTags(…)` / `TagQuery` → `world.query({ tags: { all: […] } })` | yes |
| `easing-legacy-surface` | manual | breadcrumb on `EasingFunction`, `isLegacyEasing()`, `EaseTo` / `EaseBy`, and 4-argument easing callbacks | yes — tsc accepts a 4-arg easing on 1.0.0, so this is the only signal |
| `system-lifecycle-hooks` | auto | `System` methods `initialize` / `update` / `preupdate` / `postupdate` → `onInitialize` / `onUpdate` / `onPreUpdate` / `onPostUpdate` | yes |

## 1.0.0 — sound

| id | kind | transformation | needed? |
|---|---|---|---|
| `sound-removed-exports` | manual | breadcrumb on `Audio`, `AudioImplementation`, `ExResponseType`, `ExResponseTypesLookup`, `ChannelSoundsConfiguration`, `PossibleChannels`, `PossibleSounds` | yes |
| `webaudioinstance-to-soundtrack` | auto | `WebAudioInstance` → `SoundTrack`; `new WebAudioInstance(…)` → breadcrumb | yes |
| `exresponse-to-literal` | auto | `ExResponse.type.arraybuffer` → `'arraybuffer'` (import dropped when unused) | yes |
| `sound-play-options` | auto | `sound.play(0.5)` → `sound.play({ volume: 0.5 })`; `seek(); play()` → `seek(); resume()`; `scheduledStartTime =` and pause-then-play → breadcrumb | yes — the number overload is gone, not deprecated |
| `soundmanager-options` | auto | `sounds: { jump: s }` → `sounds: [{ name: 'jump', sound: s }]`; `channels: ['sfx']` → `channel: 'sfx'` | yes — the record form is silently ignored on 1.0.0 |
| `soundmanager-members` | auto | `defaultVolume` → `volume`, `_isMuted` → `isMuted`, `addChannel(n, [c])` → `setChannel(n, c)`, `removeChannel(n)` → `setChannel(n, null)`, `play(name, 0.5)` → `play(name, { volume: 0.5 })`, `getSound() === undefined` → `== undefined`; other internals → breadcrumb | yes — `SoundManager.play(name, number)` still type-checks on 1.0.0 but the number is ignored |
| `sound-mute-semantics` | note | mute is gain-based: `mute()` no longer pauses, `unmute()` no longer starts playback | yes |

## 1.0.0 — graphics

| id | kind | transformation | needed? |
|---|---|---|---|
| `material-update-context` | auto | `material.update(shader => shader.trySetUniformFloat('n', v))` → `material.update(({ uniforms }) => { uniforms.n = v })`; anything else → `({ shaders: [shader] }) => { shader.use(); … }` + breadcrumb | yes |
| `postprocessor-process` | manual | breadcrumb on a `PostProcessor` with `getShader()` / `getLayout()` or without `process()` | yes |
| `material-options-union` | manual | breadcrumb on `interface X extends MaterialOptions` | yes |
| `obsolete-decorator-removed` | manual | breadcrumb on `@obsolete`, `ObsoleteOptions`, `maxMessages`, `resetObsoleteCounter` | yes |

## 1.0.0 — export renames

| id | kind | transformation | needed? |
|---|---|---|---|
| `pool-to-arenapool` | auto | `Pool` → `ArenaPool` | yes |
| `shape-to-colliders` | auto | `Shape.Box(…)` → `Colliders.Box(…)` (Box, Polygon, Circle, Edge, Capsule) | yes |
| `actor-args-to-options` | auto | `ActorArgs` → `ActorOptions`, `ParticleEmitterArgs` → `ParticleEmitterOptions` | yes |
| `viewport-event-casing` | auto | `EnterViewPortEvent` → `EnterViewportEvent`, `ExitViewPortEvent` → `ExitViewportEvent`, `FullScreenChangeEvent` → `FullscreenChangeEvent`, and the matching `ActorEvents` / `ScreenEvents` keys | yes |
| `direction-to-textdirection` | auto | `Direction` (text ltr/rtl enum) → `TextDirection` | yes |

## 1.0.0 — misc

| id | kind | transformation | needed? |
|---|---|---|---|
| `collider-set-to-use` | auto | `actor.collider.set(c)` → `actor.collider.use(c)` | yes |
| `null-for-empty` | manual | breadcrumb on `=== undefined` / `!== undefined` against `Component.owner`, `Collider.owner`, `ColliderComponent.get()`, graphics-context `get()`, `Director.getSceneDefinition/getSceneInstance/currentTransition`, `GraphicsComponent.onPostDraw`, `Font/SpriteFont.lineHeight`, `SpriteFont.shadow` | yes |
| `new-base-members` | manual | breadcrumb on a subclass member named like a new base member: Actor `pauseComponent` / `isPaused` / `canPause`; Scene `pause` / `resume`; Engine `plugins` / `addPlugin` / `removePlugin` / `hasPlugin` / `lighting` / `isLoaded` / `setInputEnabled` / `isHiDPI` / `currentFrameElapsed` / `currentFrameLag` | yes |
| `rotateby-exact-offset` | note | `rotateBy({ angleRadiansOffset })` without `rotationType` rotates by the exact signed offset | yes |
| `esm-only-package` | note | excalibur is ESM-only (no UMD bundle, no `require()`) | yes |
| `scene-deactivate-flush` | note | scene deactivation flushes pending removals synchronously | yes |

## 1.0.0 — API shape (getters and `isX` naming)

| id | kind | transformation | needed? |
|---|---|---|---|
| `v1-member-renames` | auto | `isOffScreen`→`isOffscreen`; Actor/Particle `paused`→`pauseComponent`; PauseComponent `paused`→`isPaused`; `Particle.visible`→`isVisible`; Engine `loadingComplete`→`isLoaded`, boolean `ready`→`isReady`, `toggleInputEnabled`→`setInputEnabled`; `isHiDpi`→`isHiDPI`; `Animation.done`→`isComplete`; Timer/Transition `complete`→`isComplete`; `Transition.started`→`hasStarted`; `Gamepad.connected`→`isConnected`; `Gamepads.enabled`→`pollingEnabled`; PointerEvent/WheelEvent `active`→`isActive`; `SystemManager.initialized`→`isInitialized`; `Future.isCompleted`→`isComplete`; `FontTextInstance.disposed`→`isDisposed`; Tile/IsometricTile `solid`→`isSolid`; input `toggleEnabled`→`setEnabled`; `PolygonCollider.isConvex()`→`checkConvex()`; `HashGridProxy.hasChanged`→`refreshAndCheckChanged` | yes (the `paused` entries only apply to projects on a v1 alpha) |
| `methods-to-getters` | auto | `x.isKilled()` → `x.isKilled`, and the same for `isRunning`, `isDisposed`, `isComplete`, `isCurrentScene`, `isCanceled`, `isPlaying`, `isPaused`, `isStopped`, `isLoaded`, `isIdentity`, `isMirrored`, `hasZeroDimensions`, `hasChanged`, `hasNext`, `isStale`, `hasPendingDraws`, `isCurrentlyBound`, `isLeaf`, `isUnlocked`, `isInitialized`; `gc.running()` → `gc.isRunning`; `await engine.isReady()` → `await engine.ready`; declarations `isLoaded(): boolean {` → `get isLoaded(): boolean {` | yes |
| `boolean-option-keys` | auto | option keys: `visible` → `isVisible` (Actor / Trigger / GraphicsComponent options), `solid` → `isSolid` (Tile), `directed` → `isDirected` (Graph edges) | yes |
| `actor-draggable-removed` | manual | breadcrumb on `actor.draggable` (handle `pointerdragstart/move/end`) | yes |
| `pause-component-options` | auto | `PauseComponentInterface` → `PauseComponentOptions` | only for projects on a v1 alpha — the old name never shipped in a stable release |

## 1.0.0 — API consistency (time units, events, last removals)

| id | kind | transformation | needed? |
|---|---|---|---|
| `time-unit-suffix-renames` | auto | `engine.currentFrameElapsedMs` → `currentFrameElapsed`, `currentFrameLagMs` → `currentFrameLag`, `stats.elapsedMs` → `elapsed`, `gifFrame.delayMs` → `delay` | yes |
| `color-equals` | auto | `color.equal(other)` → `color.equals(other)` | yes |
| `time-unit-option-keys` | auto | `new TestClock({ defaultUpdateMs })` → `{ defaultUpdate }` | yes |
| `slide-easing-option` | auto | `new Slide({ easingFunction })` → `{ easing }` | yes |
| `sound-time-units` | manual | breadcrumb with the converted value on `seek` / `position` / `duration` / `getPlaybackPosition` / `getTotalPlaybackDuration` / `scheduledStartTime` (seconds → milliseconds) | yes — manual on purpose: no shape change, so an auto ×1000 would re-apply on a second run |
| `event-types-to-strings` | auto | `EventTypes.Kill` → `'kill'`; type aliases `ex.kill`, `ex.pointerup` → literal types; unused imports dropped | yes |
| `v1-legacy-removals` | manual | breadcrumb on `ScreenShader`, `TagsComponent`, `AddedComponent` / `RemovedComponent` (+ guards), `CapturePointerConfig`, `Util.addItemToArray`, `Flags.useLegacyImageRenderer`, `imageRenderer`, `Particle.DefaultConfig`, `GifParser` / `Stream` / `LegacyWebAudioSource` | yes (`TagsComponent` was never a package export, so that one name can never match) |
| `color-invert-alpha` | note | `Color.invert()` keeps alpha; `Color.screen()` combines alpha as coverage | yes |
| `material-screenuv-origin` | manual | breadcrumb on Material GLSL that reads `v_screenuv` (bottom-left origin, follows the transform) | yes |
| `collider-owner-nullable` | note | `Collider.owner` is typed `Entity \| null` | yes |

## Known coverage gaps (no record)

- `Transition.legacyEasing` was removed.
- `screen-coordinates-rooting` does not flag `contentArea.right/bottom/bottomRight/center`, `unsafeArea.*` or `pageToScreenCoordinates`, which shifted too.
- `new Particle({ … })` keys from 0.29 (`position`→`pos`, `velocity`→`vel`, `currentRotation`→`rotation`, `particleSize`→`size`).
- `physics-sleep-defaults` only sees `new Engine({ physics })`, not the 0.29 `Physics.useRealisticPhysics()` switch.
- `tilemap-composite-strategy` pins `'together'` even if the project had set `physics.colliders.compositeStrategy: 'separate'` globally.
- Type-only changes tsc reports by itself: `Actor.color` and `Engine.canvasElementId` may be `undefined`; `Sound.instances` is `SoundTrack[]`.
