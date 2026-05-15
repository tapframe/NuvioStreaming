# Contributing

Thanks for helping improve Nuvio.

## Strict rules - read before opening anything

These rules are enforced strictly. Issues and PRs that do not follow them will be closed without review.

---

## What PRs are for

Pull requests are accepted only when they fit one of these categories:

- Reproducible bug fixes for documented issues
- UI glitch fixes for visible bugs or regressions, with before/after proof
- Behavior bug fixes that restore expected behavior without changing product direction
- Small maintenance work that does not change UI, UX, behavior, dependencies, architecture, or public contracts
- Small documentation fixes that improve accuracy
- Translation/localization updates

Pull requests are not accepted for:

- New major features
- Product direction changes
- UX/UI redesigns
- Cosmetic-only UI changes
- "Minor polish" changes to colors, spacing, typography, icons, copy, layout, animations, or visual style
- Behavior changes that are not tied to a reproducible bug or approved feature request
- Refactors without a clear maintenance need
- Dependency additions or architecture changes without prior approval

Translation PRs are allowed, as long as they stay focused on translation/localization work and do not bundle unrelated feature or UI changes.

---

## UI changes

Do not open a pull request for a UI change just because it looks better, cleaner, more modern, or more consistent to you.

UI PRs are accepted only when they fix a specific, documented glitch or bug, such as:

- Broken layout
- Overlapping or clipped text
- Unreadable content
- Incorrect visual state
- Navigation, gesture, or focus glitches
- A visible regression from a previous version
- A crash, blank screen, or unusable screen caused by UI code

Every UI PR must include:

- A linked bug issue
- A short explanation of the exact glitch being fixed
- Before and after screenshots or a short video
- The smallest possible change that fixes the glitch

Cosmetic-only UI PRs will be closed, even if the change is small.

---

## Behavior changes

Behavior includes, but is not limited to, playback, stream/source selection, resume state, watched state, search, sync, settings defaults, navigation, gestures, error handling, caching, networking, storage, downloads, offline behavior, and account-related flows.

Do not open a PR that changes behavior unless one of these is true:

- It fixes a linked, reproducible bug or regression and restores the intended behavior.
- It links an approved feature request where a maintainer explicitly approved implementation.

Behavior PRs must explain:

- The old behavior
- The broken or unwanted behavior
- The new behavior
- How the behavior was tested

Minor behavior tweaks are still behavior changes. They need the same issue link or approval.

---

## Large PRs and large changes

**Any large PR or change that is not a simple bug fix must be discussed and approved via a feature request issue first.**

1. Open a **Feature Request** issue describing the change.
2. Wait for explicit maintainer approval on that issue.
3. Link the approved issue in your PR description.

PRs that introduce large changes without a linked, approved feature request **will not be reviewed at all** and will be closed immediately. No exceptions.

This applies to UI changes, behavior changes, new features, architecture changes, dependency additions, large refactors, migrations, and changes that affect product direction.

Approval means a maintainer has clearly said the implementation is approved. A feature request being open, popular, or labeled `enhancement` is not approval.

---

## Where to ask questions

- Use **Issues** for bugs, feature requests, setup help, and general support.

---

## Bug reports (rules)

To keep issues fixable, bug reports should include:

- A short, specific issue title that describes the bug
- App version (release version or commit hash)
- Platform (Android / iOS / Desktop) + device model + OS version
- Install method (release build / TestFlight / CI / built from source)
- Steps to reproduce (exact steps)
- Expected vs actual behavior
- Frequency (always/sometimes/once)

Do not leave the title as just `[Bug]:` or another generic placeholder.

Logs are optional for most issues, but they are **required** for crash / force-close reports.

### How to capture logs (optional)

**Android:**

```sh
adb logcat -d | tail -n 300
```

**iOS:**

Attach a crash log from Xcode Organizer or Console.app, or reproduce while connected to Xcode and copy the relevant log output.

**Desktop:**

Copy the relevant terminal/console output from around the time the issue occurred.

---

## Feature requests (rules)

Please include:

- The problem you are solving (use case)
- Your proposed solution
- Alternatives considered (if any)

Opening a feature request does **not** mean a pull request will be accepted for it. If the feature affects product scope, UX direction, or adds a significant new surface area, do not start implementation unless a maintainer explicitly approves it first.

**Large changes require an approved feature request before any PR is submitted.** See the [Large PRs and large changes](#large-prs-and-large-changes) section above.

---

## Before opening a PR

Please make sure your PR is all of the following:

- Allowed by this policy
- Small in scope and focused on one problem
- Clearly aligned with the current direction of the project
- Not cosmetic-only
- Not changing behavior unless it fixes a linked bug or has explicit approval
- Not changing UI unless it fixes a linked glitch/bug and includes visual proof
- Not bundling refactors, cleanups, or drive-by changes with a bug fix
- Tested manually and/or automatically in a way that matches the risk
- Linked to an approved feature request issue if large, directional, or non-trivial

PRs will be closed without review if they:

- Are cosmetic-only UI changes
- Change behavior without a linked bug or approved feature request
- Change UI without screenshots/video
- Bundle unrelated changes
- Leave the PR template incomplete
- Add dependencies, architecture changes, or broad refactors without approval

Review time is reserved for bugs, regressions, stability, translations, documentation accuracy, and approved work.

---

## One issue per problem

Please open separate issues for separate bugs/features. It makes tracking, fixing, and closing issues much faster.
