# Sign-in quiet redesign receipt

Date reviewed: 2026-08-11 UTC
Scope: `composeApp/src/commonMain/kotlin/com/nuvio/app/features/auth/AuthScreen.kt` and shared Compose resources.

## Applied guidance

- Material buttons: label text should be very brief, ideally 1 to 3 words, and stay on one line. Source: https://m3.material.io/components/buttons/guidelines
- Material buttons: filled style is for one important action on a page; outlined/text styles are lower emphasis. Source: https://m3.material.io/components/buttons/guidelines
- Material writing: UI text should use sentence case and scannable wording. Source: https://m3.material.io/foundations/content-design/style-guide/ux-writing-best-practices
- WCAG 3.3.2: labels and instructions are required, but too much instruction can be as harmful as too little. Source: https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html
- WCAG 2.5.8: pointer targets should be at least 24 by 24 CSS pixels or have sufficient spacing. Source: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- Google Identity: sign-in calls to action should use clear `Sign in`, `Sign up`, or `Continue with` wording when a provider is involved. Source: https://developers.google.com/identity/branding-guidelines
- Apple developer pages were requested and search snippets confirmed the relevant HIG pages, but the pages currently redirect to themselves and could not be opened. Sources attempted: https://developer.apple.com/design/human-interface-guidelines/buttons and https://developer.apple.com/design/human-interface-guidelines/writing

## Change

- Removed the mobile brand tagline from the auth lockup.
- Removed the decorative `or` divider from the form.
- Removed the full-width anonymous continuation button and its separate local-storage disclaimer.
- Kept anonymous continuation as a low-emphasis text action, `Continue Without Account`, with a 48.dp target.
- Kept the primary account action as the single filled button.

## Verification

- `:composeApp:compileKotlinIosSimulatorArm64`: passed.
- `:composeApp:linkDebugFrameworkIosSimulatorArm64`: passed.
- `xcodebuild -project iosApp/iosApp.xcodeproj -scheme iosApp -configuration Debug -destination platform=iOS Simulator,id=7A85E485-B869-4335-9721-64927C592766 CODE_SIGNING_ALLOWED=NO build`: passed.
- Screenshot reviewed: `build/auth-quiet-mobile.png`.
