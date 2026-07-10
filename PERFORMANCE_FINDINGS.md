# Nuvio Performance Findings — iOS Frame Drops & Navigation Lag

**Date:** 2026-07-09 · **Scope:** HomeScreen, MetaDetailsScreen, StreamsScreen, navigation transitions, shared components.
**Constraint:** every fix below is behavior-preserving — no UI, functional, or visual changes. They only change *when* and *how often* Compose recomposes/relayouts/redraws.

---

## 0. Framework baseline (context, not a code change)

- We are on **CMP 1.11.1**, which already contains the two big JetBrains iOS fixes: the Metal "blocked waiting for next drawable" stall (fixed in `1.11.0-alpha04`, [CMP-9465](https://youtrack.jetbrains.com/issue/CMP-9465)) and broken fling gestures in LazyColumn ([CMP-9297](https://youtrack.jetbrains.com/issue/CMP-9297), fixed in `1.11.0-beta01`).
- JetBrains has acknowledged a *remaining* fluidity gap vs native on 120Hz devices (CMP-9465 comments) with no scheduled fix. `Info.plist` already enables `CADisableMinimumFrameDurationOnPhone`, so we render at 120Hz — an 8.3ms frame budget. **Everything below is about staying inside that budget.**
- **Always profile in Release.** Kotlin/Native debug binaries are drastically slower ([CMP-8912](https://youtrack.jetbrains.com/issue/CMP-8912) was closed for exactly this). A debug build via Xcode/`run-mobile` is not representative.
- Optional experiment: `1.12.0-beta01` exists and continues iOS renderer work — worth a test build against the worst screen.

---

## P0 — Fixes with the largest, most visible wins

### P0-1 · MetaDetailsScreen: raw scroll-offset read in composition recomposes the whole screen every scrolled pixel

**File:** `composeApp/src/commonMain/kotlin/com/nuvio/app/features/details/MetaDetailsScreen.kt:732-745`

```kotlin
val detailScrollOffsetPx = if (listState.firstVisibleItemIndex == 0) {
    listState.firstVisibleItemScrollOffset.toFloat()
} else { ... }
val heroScrollOffset = detailScrollOffsetPx.toInt()
val headerTarget = if (heroHeightPx > 0 && (listState.firstVisibleItemIndex > 0 || detailScrollOffsetPx > thresholdPx)) 1f else 0f
```

`listState.firstVisibleItemScrollOffset` is read **directly in composition**, in the scope that contains the entire `BoxWithConstraints` → `LazyColumn` → all detail sections. Every scrolled pixel invalidates that scope: the whole LazyColumn item DSL re-executes (including `configuredMetaSectionItems` and its `settings.items.filter {…}` / `settings.copy(...)` allocations at `MetaDetailsScreen.kt:1389,1417`), and `DetailHero` receives a new `scrollOffset: Int` param, so the hero item (with its `AsyncImage`, gradients, trailer chrome) recomposes per pixel too. This is the single biggest cause of MetaScreen scroll jank.

**Fix (standard "defer state reads" pattern, zero visual change):**
1. `DetailHero`'s `scrollOffset: Int` param → `scrollOffsetProvider: () -> Float`. In `DetailHero.kt:116` and `:146` the value is only used inside `graphicsLayer { translationY = scrollOffset * 0.5f }` — call the provider *inside* the lambda so the parallax happens purely at draw time with **zero recomposition**.
2. The gradient overlay at `MetaDetailsScreen.kt:978-980` already uses `graphicsLayer {}` but captures `detailScrollOffsetPx` as a composition value — read `listState.firstVisibleItemScrollOffset` inside the `graphicsLayer` lambda instead.
3. `headerTarget`, and the scroll-position part of `heroTrailerPlayWhenReady` (`:752-754`), are threshold booleans — wrap in `remember { derivedStateOf { … } }` so they only invalidate when crossing the threshold, not per pixel.
4. After 1–3, nothing in composition reads the raw offset anymore.

**Risk:** none — identical rendered output, reads just move to the draw phase.

---

### P0-2 · HomeScreen hero: parallax scroll offset computed in composition recomposes the entire hero every scrolled pixel

**File:** `composeApp/src/commonMain/kotlin/com/nuvio/app/features/home/components/HomeHeroSection.kt:116-126`

```kotlin
val scrollOffsetPx by remember(listState, heroHeightPx) { derivedStateOf { … } }
val heroScrollScale = heroBackgroundScrollScale(scrollOffsetPx)      // ← composition read
val heroScrollTranslationY = heroBackgroundScrollTranslationY(scrollOffsetPx)
```

The `derivedStateOf` doesn't help here because `scrollOffsetPx` changes continuously and is read in composition at the `BoxWithConstraints` scope. Every scrolled pixel while the hero is visible recomposes the whole hero: all visible `AsyncImage` layers, two gradient boxes, the content column, and the pager dots. Since the hero is on screen at the exact moment users start scrolling Home, this is the "home scroll feels heavy" hot spot.

**Fix:** the computed values are only consumed inside `graphicsLayer {}` blocks (`:177-183`). Move the calls inside: `graphicsLayer { translationY = heroBackgroundScrollTranslationY(scrollOffsetPx); val s = HERO_BACKGROUND_SCALE * heroBackgroundScrollScale(scrollOffsetPx); … }`. State read inside `graphicsLayer` lambda = draw-phase only.

Also in the same file: `heroPageOffset(pagerState, …)` (`:134`) and `heroPageVisibility(pagerState, index)` (`:278`) read pager offset fractions in composition, so every frame of a hero page animation recomposes the full hero, and the dots relayout via `.width(8.dp + 24.dp * activeFraction)` (`:291`). The image/content alpha+translation consumers are already `graphicsLayer` lambdas — pass the layer's page/offset lookup into the lambda the same way. The dot **width** is a real layout property; leave it (tiny), or accept per-frame layout of a 8×8dp box — but stop it from invalidating the whole hero by reading `activeFraction` only inside the dot's own draw/layout modifier scope.

**Risk:** none for the graphicsLayer moves; identical output.

---

### P0-3 · App.kt: back-stack observation recomposes the whole Home tab at the exact frame every push/pop transition starts

**File:** `composeApp/src/commonMain/kotlin/com/nuvio/app/App.kt:673, 1511, 1573, 1578`

`currentBackStackEntry` is observed via `currentBackStackEntryAsState()` (`:673`) and read inside `composable<TabsRoute>` (`:1511`):

```kotlin
val tabsRouteActive = currentBackStackEntry?.destination?.hasRoute<TabsRoute>() == true
…
rootActionsEnabled = tabsRouteActive,          // :1573
animateHomeCollectionGifs = tabsRouteActive,   // :1578
```

When you tap a poster, `currentBackStackEntry` changes on the first frame of the slide animation → `tabsRouteActive` flips → **`AppTabHost` and the entire HomeScreen tree recompose exactly when the push animation starts competing for the same frame budget**. The same happens again on pop. This is a direct cause of "navigation to meta screen / back is laggy."

**Fix options (either is behavior-preserving):**
- Derive the flag so it only invalidates on actual change and reaches only the consumers that need it: hoist `val tabsRouteActive by remember { derivedStateOf { … } }` (it already only changes on real route change — the win comes from narrowing *where it's read*). Pass it via a `CompositionLocal` or a `State<Boolean>` read *inside* the few leaf composables that use it (settings root actions; the GIF animation gate), instead of as two `AppTabHost` parameters that invalidate the whole host.
- At minimum, pass `State<Boolean>`/lambda providers (`rootActionsEnabled: () -> Boolean`) down so the flip doesn't change `AppTabHost`'s parameters.

Also `NativeProfileSwitcherPopup`'s `tabsRouteActive` read (`:1677`) can use the same derived state.

**Risk:** low — same values, delivered through a narrower channel. Verify GIF pause-on-navigate still works (it will: the leaf reads the same flag).

---

### P0-4 · StreamsScreen: index-based lazy keys make every progressive result batch rebuild the whole list

**File:** `composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamsScreen.kt:958-967, 1004-1016`

`streamCardRenderKey` embeds `sourceIndex` and `itemIndex`. While providers stream results in (the screen's hottest phase), each new batch re-groups and re-sorts (`:944-947`), shifting indices — so **most existing items get brand-new keys**, are treated as removed+inserted, fully recomposed, and their `AsyncImage`s (addon logos) restart. Combined with global `crossfade(true)`, arrival of each batch repaints the visible list.

**Fix:** make keys content-derived only (drop `sourceIndex`/`itemIndex`; keep the existing duplicate-safe suffix approach used elsewhere — see `withDuplicateSafeLazyKeys` in `ShelfComponents.kt:90`) so an unchanged stream keeps its identity when neighbors arrive. Additionally hoist `group.streams.groupBy{…}` + `sortedBy` (`:944-947`) into a `remember(group.streams)` at the composable layer or precompute in `StreamsRepository` — the LazyColumn DSL re-executes on every uiState emission and currently re-allocates these every time.

**Risk:** low — same ordering, same visuals. Watch for key collisions (two identical URLs in one source) — the duplicate-safe wrapper handles that.

---

## P1 — Significant wins, slightly more involved

### P1-1 · HomeScreen: 14 top-level StateFlow subscriptions + heavy derived chains run in one giant recomposition scope

**File:** `composeApp/src/commonMain/kotlin/com/nuvio/app/features/home/HomeScreen.kt:115-136, 176-283`

Any emission from any of ~14 flows (watch progress, watched, cloud library, network status, Trakt, collections, …) recomposes the whole `HomeScreen` function scope, re-evaluating every `remember(...)` key comparison and, when keys changed, chains like `filter`/`groupBy`/`associate`/`distinctBy` over all watch-progress entries (`:176-283`) — **on the main thread, during composition**. `WatchProgressRepository` can emit while you're scrolling (e.g. sync), causing hitches unrelated to scrolling itself.

**Fix (incremental, no behavior change):**
1. Move the pure derivations (`effectiveWatchProgressEntries`, `allNextUpSeedCandidates`, `nextUpSuppressedSeriesIds`, `completedSeriesCandidates`, `visibleSeriesPosterTargets`, …) out of composition into a combined flow (`combine(...).map { … }.flowOn(Dispatchers.Default)`) exposed by a small presenter/repository object, collected as **one** state. Composition then just reads precomputed lists.
2. Where a flow feeds only one subtree (e.g. `networkStatusUiState` → offline card), collect it *inside* that subtree so its emissions don't touch the rest of Home.

**Risk:** medium-low — pure refactor of pure functions; verify with existing tests (several of these helpers are `internal` and already unit-tested).

### P1-2 · MetaDetailsScreen: `headerProgress` animation read in composition at top scope

**File:** `composeApp/src/commonMain/kotlin/com/nuvio/app/features/details/MetaDetailsScreen.kt:755-762, 994`

`headerProgress by animateFloatAsState(...)` is read at `:994` (`if (headerProgress <= 0.05f)`) in the top content scope — during the 100–150ms header fade **every animation frame recomposes the whole detail scope** (which, pre-P0-1, is also recomposing per scroll pixel — they compound).

**Fix:** the `<= 0.05f` gate is a boolean — `remember { derivedStateOf { headerProgress <= 0.05f } }` (or drive the back button's alpha via `graphicsLayer` and keep it always composed — it's a small node). `DetailFloatingHeader` already consumes progress via `graphicsLayer` internally; pass the `State<Float>`/provider instead of the raw float so the header animates without invalidating the parent.

**Risk:** none.

### P1-3 · Poster cards: per-card repository subscription + `ensureLoaded()` on every recomposition

**File:** `composeApp/src/commonMain/kotlin/com/nuvio/app/core/ui/PosterCardStyleCompose.kt:8-12`, used by `NuvioPosterCard` (`ShelfComponents.kt:126`) and per-row (`HomeCatalogSection.kt`)

```kotlin
internal fun rememberPosterCardStyleUiState(): PosterCardStyleUiState {
    PosterCardStyleRepository.ensureLoaded()          // runs on EVERY recomposition
    val uiState by PosterCardStyleRepository.uiState.collectAsState()
    return uiState
}
```

Every poster card on screen (dozens on Home) creates its own flow collection, and `ensureLoaded()` is called on every recomposition of every card (it's not inside `remember`).

**Fix:** wrap the side effect: `remember { PosterCardStyleRepository.ensureLoaded(); PosterCardStyleRepository.uiState }.collectAsState()`. Better: collect once near the root and provide via `CompositionLocal` (style changes are rare; cards read the local). Identical visuals.

**Risk:** none.

### P1-4 · LazyRows/LazyColumns: no `contentType` anywhere

**Files:** `ShelfComponents.kt:84-107` (`NuvioShelfSection`), `NuvioScreen` consumers, `StreamsScreen.kt` sections, `MetaDetailsScreen.kt` section items.

Compose's item-reuse pool is keyed by `contentType`; without it, every new-item composition during scroll starts cold. Poster rows are perfectly homogeneous — ideal reuse candidates. Add `contentType = "poster"` to shelf items, `"stream"`/`"header"` in `streamSection`, and a type per section kind in `configuredMetaSectionItems`. On iOS this measurably reduces time-to-first-frame for newly revealed items during fast scroll (prefetch + pausable composition in CMP 1.11 benefit from it too).

**Risk:** none — `contentType` is purely a reuse hint.

### P1-5 · Tab switching recomposes an entire screen from scratch

**File:** `composeApp/src/commonMain/kotlin/com/nuvio/app/App.kt:3089-3153`

`SaveableStateProvider(selectedTab.name)` + `when (selectedTab)` disposes the old tab and builds the new one from zero — switching Home→Search→Home rebuilds HomeScreen completely (all rows, all images decode from memory cache, all flow subscriptions restart). Scroll state survives; composition doesn't.

**Fix (choose one):**
- Wrap each tab's content in `remember { movableContentOf { … } }` so composition is *moved*, not destroyed (needs care with `SaveableStateProvider`); or
- Keep all four tabs composed inside a `Box`, toggling with `Modifier.alpha/zIndex` + `graphicsLayer` and gating each hidden tab's expensive effects — **not recommended** as first step (changes lifecycle semantics: hidden tabs keep collecting).

The `movableContentOf` route preserves current semantics (one active tab) while eliminating the rebuild. Given Home is by far the heaviest tab, even doing this for Home alone helps.

**Risk:** medium — needs testing around saveable state and `LaunchedEffect` re-runs. Do after P0s.

### P1-6 · Pop-back to Home recomposes the whole Home tree during the pop animation

Not a bug — it's how NavHost works (the destination left the composition after push completed; on pop it re-enters on frame 1 of the animation). The fix is indirect: **every P0/P1 item above shrinks the cost of that first frame** (especially P0-2, P1-1, P1-3, P1-4). After those land, re-measure; if the pop hitch is still visible, the remaining spike is image re-decode — Coil memory cache keeps decoded bitmaps, so verify hero/backdrop images aren't evicted (see P2-3).

---

## P2 — Cheap insurance / smaller or conditional wins

### P2-1 · Full-screen `Modifier.blur` on iOS (Skia gaussian blur is expensive)

- `StreamsScreen.kt:482` — full-screen `blur(22.dp)` backdrop behind the whole streams UI, alive while results stream in and the list repaints.
- `MetaDetailsScreen.kt:824-838` — Cinematic mode: full-screen `blur(30.dp)` backdrop (already gated behind `deferredMetaWorkAllowed`, good).
- `HomeContinueWatchingSection.kt:714, 1015` — per-thumbnail `blur(18.dp)` when "blur next up" is on.

These backdrops are *static once loaded* — the pixels never change — but the blur filter is retained on the layer. **Regression-free mitigation:** keep the visual, pay the cost once: render the blurred backdrop into a bitmap (e.g. Coil custom `Transformation` doing the blur at decode time on a background thread, or `rememberGraphicsLayer()` + one-time `toImageBitmap()`), then draw the plain bitmap. Identical look, zero per-frame filter cost. The overlay `Box` with 0.82–0.92 alpha stays as-is.

### P2-2 · MetaDetailsScreen: self-retriggering reload effect

**File:** `MetaDetailsScreen.kt:268-282` — the `LaunchedEffect` keyed on `uiState.isLoading` calls `MetaDetailsRepository.load(type, id)` whenever `displayedMeta != null && !isLoading`, i.e. it re-runs `load()` immediately after every successful load. `load()` early-returns via cache (`MetaDetailsRepository.kt:57-71`), so it's not an infinite loop, but it *does* run fingerprint building + cache checks on the main thread right when the screen settles, and re-runs on every settings-related emission. Key the effect on the actual settings inputs only (drop `uiState.isLoading`/`displayedMeta` from keys, guard inside) — same behavior, no redundant churn during entry.

### P2-3 · Coil: give iOS an explicit memory-cache budget

**File:** `PlatformImageLoader.ios.kt` (currently a no-op), `App.kt:388-398`. Defaults are fine-ish, but on image-heavy screens the default 25% budget with big hero/backdrop bitmaps can evict poster thumbnails, making pop-back re-decode them (see P1-6). Set an explicit `memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.25).build() }` and consider `.precision(Precision.INEXACT)` defaults; measure before/after. No visual change.

### P2-4 · `NuvioShelfSection`: per-recomposition key-wrapping allocation

**File:** `ShelfComponents.kt:90` — `entries.withDuplicateSafeLazyKeys(key)` allocates a wrapped list every time the row recomposes. `remember(entries) { … }` it. Micro, but it's in every row on Home.

### P2-5 · Home rows: `watchedKeys` set identity invalidates all rows on any watched change

**File:** `HomeScreen.kt:878-879` → `HomeCatalogSection.kt`. Marking one item watched rebuilds the `Set` → every visible row's parameters change → all rows recompose (not just the affected poster). Acceptable frequency-wise; if it shows up in traces, derive `isWatched` per item via a stable lookup (e.g. provide the repository state via a local and compute inside the card) so only affected cards invalidate. Do only if profiling shows it.

### P2-6 · App.kt god-composable

3,338 lines with ~20 `collectAsStateWithLifecycle` at various scopes (`:666-746`, `:1037+`). Any of those emitting recomposes large swaths of the nav shell. Splitting the route graph bodies into top-level `@Composable` functions (each collecting only what it needs) creates recomposition firewalls and makes the compiler's skipping effective. Mechanical, no behavior change — do it opportunistically when touching App.kt.

---

## Verification plan (how to confirm each win)

1. Build **Release** to a physical device (ideally 120Hz).
2. Xcode Instruments → *Animation Hitches* + *Time Profiler*: record (a) Home scroll, (b) poster→Meta push, (c) back-swipe pop, (d) Streams while results load. Save as baseline.
3. Land P0-1..P0-4 (each is a small, independent diff) → re-record. Expect the Meta scroll and push/pop hitches to drop first.
4. Land P1 items → re-record, especially pop-back (P1-6).
5. Keep an eye on `Hitch time ratio` in Instruments; target <5ms/s on scroll.

## Suggested landing order

| Order | Item | Effort | Expected impact |
|---|---|---|---|
| 1 | P0-1 Meta scroll-read deferral | S | Large (Meta scroll + push) |
| 2 | P0-2 Home hero parallax deferral | S | Large (Home scroll) |
| 3 | P0-3 backstack flag narrowing | S | Large (push/pop start hitch) |
| 4 | P0-4 stream list keys + grouping hoist | S | Large (Streams loading phase) |
| 5 | P1-2, P1-3, P1-4 | S | Medium, broad |
| 6 | P1-1 Home derivation hoist | M | Medium-large |
| 7 | P2-1 blur pre-render, P2-3 cache budget | M | Medium (Streams/Meta entry, pop-back) |
| 8 | P1-5 movable tab content | M | Medium (tab switches) |
