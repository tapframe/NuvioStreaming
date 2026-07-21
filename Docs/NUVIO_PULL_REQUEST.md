## Summary

Draft implementation of a native, localized Parents Guide accordion on movie and series details. It uses a separately hosted, open-source metadata-only API and does not change streams, playback, or source selection.

## PR type

- [ ] Reproducible bug fix
- [ ] UI glitch/bug fix
- [ ] Behavior bug/regression fix
- [ ] Small maintenance only, with no UI or behavior change
- [ ] Docs accuracy fix
- [ ] Translation/localization only
- [ ] Approved larger or directional change

This remains unchecked while the feature request is awaiting explicit maintainer approval.

## Why

Families cannot currently review sourced category summaries or scene-level parental advisories before playback. The proposed section covers sex and nudity, violence and gore, profanity, alcohol/drugs/smoking, and frightening/intense scenes without affecting the normal details flow when data is unavailable.

## Issue or approval

Awaiting a maintainer decision in #1601. This PR is intentionally a draft and is not submitted as review-ready before approval.

## UI / behavior impact

- [ ] No UI change
- [ ] No behavior change
- [ ] UI changed only to fix a documented glitch/bug
- [ ] Behavior changed only to fix a documented bug/regression
- [ ] UI change has explicit maintainer approval
- [ ] Behavior change has explicit maintainer approval

The implementation adds UI and network/cache behavior. The approval boxes will remain unchecked unless maintainers approve #1601.

## Policy check

- [x] I have read and understood `CONTRIBUTING.md`.
- [x] This PR is small, focused, and limited to one problem.
- [x] This PR is not cosmetic-only.
- [ ] Any UI change fixes a linked glitch/bug and includes visual proof, or this PR has no UI change.
- [ ] Any behavior change fixes a linked bug/regression or has explicit approval, or this PR has no behavior change.
- [x] This PR does not bundle unrelated refactors, cleanups, formatting, or drive-by changes.
- [x] This PR does not add dependencies, architecture changes, migrations, or product-direction changes without explicit approval.
- [x] I listed the testing performed below.

The approval-dependent checks will be completed only after explicit approval and visual proof.

## Scope boundaries

- No streaming resource, torrent behavior, playback-source behavior, or navigation redesign.
- Sends only the current title identifiers, media type, optional season/episode, and language.
- API errors are isolated from metadata loading and the rest of the details page.
- Uses the existing Show Parental Guide preference as the master switch.
- Initial cache is process-local; persistent settings/cache are outside this draft.

## Testing

- Backend: formatting, lint, strict type-check, 12 Vitest tests, production build, Vercel deployment, Neon readiness, and external endpoint smoke tests passed.
- Mobile: `./gradlew :composeApp:compileKotlinIosSimulatorArm64` passed after the production endpoint was configured.
- iOS tests compiled and linked, but simulator execution could not complete because the local simulator service hung.
- Android was not verified because the Android SDK is unavailable in the current environment.

Added mobile tests cover JSON/status/provenance/timestamps, partial success, network error isolation, cache hit/expiry, identifier resolution, category ordering/severity, spoiler filtering, and timestamp formatting.

## Screenshots / Video (UI changes only)

Pending feature approval and access to a working simulator/device. Before review, this draft needs collapsed, expanded-category, scene-detail, partial, unavailable, error, dark/light, large-text, and RTL captures.

## Breaking changes

None. With the feature disabled, no request or section is added. Missing guides and API failures leave the normal details page functional.

## Linked issues

#1601 — awaiting explicit maintainer approval.
