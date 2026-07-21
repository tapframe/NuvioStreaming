# Add native Parents Guide details section

## Problem

Nuvio currently has a brief player-start content-warning overlay, but the details screen cannot show sourced category summaries or scene-level parental advisories before playback.

## Proposed solution and placement

Add a native, localized `ParentsGuideSection` to the details screen. The keyed lazy-list section is inserted immediately after Movie/Series Details and before More Like This; when users reorder or hide metadata sections it remains before recommendations. It is independent from stream and playback-source code.

The top-level row and each category are independently expandable. The section supports loading, available, partial, unavailable, error/retry, stale cache, spoiler hiding, severity text, optional timestamps, source attribution, and a contribution action. Touch targets are at least 48 dp and screen-reader descriptions are provided.

## Architecture

- `ParentsGuideRemoteDataSource`: minimal HTTP GET using the existing multiplatform network primitive.
- `ParentsGuideCache`: successful results for 24 hours and unavailable results for one hour; stale successful data is returned when refresh fails.
- `ParentsGuideClient`/`ParentsGuideRepository`: request coalescing, identifier mapping, error isolation, and UI-state mapping.
- `ParentsGuideModels`: strict kotlinx.serialization wire model and canonical category/severity ordering.
- `ParentsGuideSection`: theme-derived Compose accordion components.
- `ParentsGuideConfig`: build-generated `PARENTS_GUIDE_API_BASE_URL`. It defaults to the production service at `https://nuvio-parents-guide-addon.vercel.app`; local builds can override it in `local.properties` or the environment.

The Stremio v3 protocol has no standard Parents Guide resource. The companion addon publishes a valid no-stream manifest and a custom `/parentsguide/:type/:id.json` resource; this client calls the equivalent versioned API directly.

## Privacy

Only the current title's IMDb/TMDB/Stremio identifier, media type, optional season/episode, and language are sent. No viewing history, profile identity, library state, playback position, or stream information is transmitted.

## Screenshots

Required before opening the PR: collapsed, expanded categories, scene detail, partial, unavailable, error, dark/light, large text, and RTL screenshots. No screenshot is claimed in this preparation branch because a production API and emulator/device were not configured.

## Tests performed

- iOS simulator shared-source compilation: `./gradlew :composeApp:compileKotlinIosSimulatorArm64`
- iOS simulator common tests: `./gradlew :composeApp:iosSimulatorArm64Test`
- Android: `./gradlew :composeApp:assembleDebug -Pnuvio.android.distribution=playstore` (record final result before PR)

Added tests cover JSON/status/provenance/timestamps, partial success, network error isolation, cache hit/expiry, identifier resolution, category order/severity, spoiler filtering, and timestamp formatting.

## Compatibility and fallback

The feature reuses the existing Show Parental Guide preference as its master enable switch. With the feature disabled, no request or section is added. With no configured endpoint or no guide, the normal details page remains functional and an unavailable state is shown. API errors are contained in the section and never fail metadata loading. Cached data can be displayed offline.

## Known limitations

- A stable production API URL and legal/operator contact must be approved before release.
- Cache is process-local in this first contribution; it supports transient offline use but not restoration after app restart.
- Episode requests include season/episode when encoded in the current ID. A future follow-up can surface an explicit episode selector and persist display preferences independently.
- Initial new strings are English and require community translation after merge.
