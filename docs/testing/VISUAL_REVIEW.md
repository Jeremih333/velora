# Visual regression review

Updated: 2026-08-11.

## Covered surfaces

The authenticated critical journey records stable full-page screenshots for eight product states:

- onboarding home;
- discovery search;
- expanded character card;
- creator profile;
- active chat;
- memory editor inside a chat;
- lorebook settings and entries;
- account settings.

Every state is checked on the Playwright Android, iPhone/WebKit and desktop Chromium projects. The
repository therefore contains 24 Linux reference images. Screenshots wait for document fonts,
disable animation, hide the caret and allow at most a `0.003` changed-pixel ratio.

Linux CI is authoritative for pixels because system font rasterization is operating-system
specific. Windows still runs the same semantic, geometry, overflow, focus and interaction checks,
but intentionally does not compare Linux PNG bytes.

## Findings resolved during review

The first generated set exposed two defects that semantic assertions had not made obvious:

1. A saved explicit `dark` theme inherited the host operating system's light variables. Explicit
   dark, light and AMOLED tokens now override host preference, and the E2E flow verifies the root
   theme attribute and computed dark background.
2. Native selects on iPhone/WebKit could render a white native surface with light text under the
   dark theme. Every explicit theme now declares its matching browser `color-scheme`.
3. The fixed mobile navigation overlapped the chat composer. The mobile composer now reserves the
   navigation and safe-area height, while a bounding-box assertion proves the input ends above the
   navigation on every covered viewport.

The regenerated images were manually reviewed for clipping, horizontal overflow, long-form card
layout, avatar aspect ratio, toast/modal layering, sticky navigation and readable light/dark
contrast. The checked states contain no unresolved viewport escape or inaccessible chat input.

## Evidence and limits

Baseline generation is performed by `.github/workflows/visual-baselines.yml`; ordinary GitHub CI
runs the same E2E journey without `--update-snapshots`, so an unexplained pixel change fails the
mandatory gate. The final baseline source run is GitHub Actions run `31525601020`.

This report is not a claim of complete WCAG conformance or coverage of every future screen. It does
not authorize production deployment or paid AI use. VoiceOver, TalkBack and real Telegram host
checks remain manual release checks.
