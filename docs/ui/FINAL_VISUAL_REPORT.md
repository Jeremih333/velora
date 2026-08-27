# Final visual report

## Current verdict

The reference corpus is complete: 46/46 controlled images have expected/actual/diff directories. Functional coverage is substantial, but exact visual parity is **not approved** for the complete set. Therefore the UI master contract is not globally complete and no release-level claim is made from this report.

The owner completed the interactive review gallery on 25 August 2026 and exported
`velora-visual-review.json` for production version `a49a7268-fd9f-40a7-b145-e47696ed36f5`.
The authoritative result is **23 REVIEWED_PASS / 23 REVIEWED_FAIL**. Approved states are
`ui-02`, `ui-03`, `ui-06`, `ui-08`, `ui-15`, `ui-18`-`ui-22`, `ui-24`, `ui-31`, `ui-32`,
`ui-34`, `ui-35`, `ui-38`-`ui-41`, and `ui-43`-`ui-46`. The remaining states require another
implementation and review pass; automated functional coverage must not upgrade them to visual PASS.

## Proven

- All 46 source references are present and hash-addressed in the manifest.
- Every reference has a deterministic route, fixture, state, action sequence and evidence location.
- Production-like Playwright projects exercise iPhone, Android and desktop.
- The latest full gate passed its functional, accessibility and production-like build checks.
- On 24 August 2026 the complete stateful iPhone journey was rerun from the production web build
  after repairing the shared token layer; it passed in 6.8 minutes. The separate Unicode/CJK/RTL
  filter journey also passed, and fresh canonical phone `actual`/`diff` artifacts were promoted for
  all 46 rows.
- A regression now rejects every consumed but undefined CSS custom property. The repaired sheet has
  zero undefined properties; previously missing spacing, surface, focus and color aliases could
  invalidate complete browser declarations and create inconsistent component geometry.
- On 25 August 2026 the primary iPhone journey was rerun against a fresh production web build with
  deterministic local monochrome character media rather than letter-only placeholders. The media
  exercises real `CharacterImage` content URLs, focal cropping, rounded card geometry and offline
  rendering without copying third-party artwork. Manual review caught an inconsistent paginated
  result count (`1` beside two rendered cards); the fixture/API contract and browser assertion now
  require the correct total of `2`. The complete 3.8-minute journey, strict typecheck, lint and
  secret scan pass, and canonical phone evidence was rebuilt for rows `01` through `35`.
- On the same source revision the dedicated Unicode/CJK/RTL filter journey rebuilt rows `36` and
  `37`, and a subsequent complete pricing journey rebuilt rows `38` through `46`. Therefore all
  46 canonical `actual-iphone.png` and `diff-iphone.png` artifacts now describe the current UI,
  rather than a mixture of old and new builds.
- `toolkit/build-visual-contact-sheet.mjs` produces matching expected and actual contact sheets for
  all 46 rows. The latest whole-corpus review found one coherent monochrome Velora design language,
  stable navigation placement and no obvious cross-state theme regression. This is a review aid,
  not a substitute for row-level expected/actual/diff approval.
- On 25 August 2026 the complete authenticated `@visual @a11y` journey passed again on Android,
  tablet and desktop from a fresh production web build (one stateful run per viewport). Together
  with the fresh iPhone artifacts, this revalidates navigation, creation, discovery, chat, model,
  memory, Lorebook and pricing layouts across the supported responsive classes.
- The drawer review then exposed a state-fixture defect: `ui-03` kept both creation and library
  accordions expanded, pushing the intended library destinations below the short Telegram viewport.
  The state setup now deliberately collapses creation while preserving the user's accordion state
  in normal navigation. Real deep links to blocked users, support and legal sections were added,
  tested and recaptured; unavailable reference destinations remain hidden rather than inert.
- The `ui-04`–`ui-06` library audit added the missing server-backed character type filter, explicit
  visibility badges, reload-safe URL state and full keyboard movement in the sort popup. A fresh
  3.8-minute production-build iPhone journey exercised the D1 query contract, URL restoration,
  Lorebook flow and accessibility before those three canonical artifacts were promoted.
- The `ui-07`–`ui-09` editor review found that its sticky submit panel physically covered middle
  fields and competed with bottom navigation. The panel now stays in normal form flow, transient
  toasts are cleared before canonical capture, and a viewport geometry assertion rejects any future
  overlap. A fresh 8.2-minute production-build iPhone journey passed before the three artifacts were
  promoted and manually reviewed.
- The `ui-10`–`ui-12` review found a narrow-screen search control that left too little usable space
  for the dialog query. Its submit action now becomes a labelled 48 px icon below 480 px while the
  desktop text action remains intact. A DOM geometry regression rejects overlap and input widths
  below 150 px. After one isolated mock-server CORS failure, an immediate clean rerun of the complete
  4.2-minute production-build iPhone journey passed; rows 10–12 were promoted and manually reviewed.
- The `ui-13`–`ui-15` review found that persona editing reused the list page's scroll position while
  the global fixed navigation covered form content. Persona editing now has a single viewport-height
  workspace scroller, its own compact sticky header and no unrelated top/bottom navigation. Entry
  resets the document position and exit restores the former list position. Regression assertions
  require the avatar block and final actions to be inside the viewport. A rejected fixed-overlay
  attempt exposed and prevented a later chat visibility regression; the corrected complete 3.9-minute
  production-build iPhone journey passed before rows 13–15 were promoted and manually reviewed.
- The `ui-16`–`ui-22` chat review confirmed the viewport-owned header/message/composer/navigation
  layout and found one nested-state defect: launching model selection from settings left the inspector
  mounted beneath the catalog, exposing a second close control. The model shortcut now clears every
  inspector state before opening its mutually exclusive picker/catalog flow, and the browser asserts
  those panels are absent. A fresh 3.9-minute production-build iPhone journey passed before rows
  16–22 were promoted; manual review confirms the catalog now exposes one close control.
- The `ui-23`–`ui-26` review found that the public character DOM placed its primary start action
  below long description and greeting content. The action and compact metrics now precede those
  expandable sections, and a component regression verifies the semantic DOM order. The same pass
  recalibrated the shared compact character, owned-character and owner-profile grids: mobile cards
  use a shorter square cover, bounded two-line copy, compact touch-safe actions, explicit cover
  cropping and a smaller profile-name scale without character-by-character wrapping. The complete
  production-build iPhone journey passed in 3.4 minutes and refreshed the affected canonical states.

- The `ui-27`-`ui-28` chat-list review replaced the tall promotional heading stack with a compact
  two-column title and management row, reduced conversation-card density, and added a geometry
  regression proving that the first complete conversation remains above bottom navigation. The
  sort menu stays keyboard-operable and contained inside the mobile viewport.
- The `ui-29`-`ui-35` filter review exercised opening, tag selection, long-query wrapping,
  exclusion, deep scrolling, reset/apply controls and the resulting catalog state. The sheet keeps
  one bounded internal scroller, preserves touch-safe controls and exposes long values without
  horizontal overflow; no reference-only positional workaround was added.
- The `ui-36`-`ui-37` review separately verifies Unicode, CJK and RTL language rows plus every
  supported group-size option. Fresh focused journeys pass on phone, tablet and desktop, and their
  canonical evidence was rebuilt from the current production bundle.
- The `ui-38`-`ui-46` billing review verifies the horizontal plan comparison, 30/90/365-day
  switching, complete card reachability, native FAQ disclosures and operation history. Stars remain
  one-time fixed-period purchases; the interface does not copy the reference product's recurring
  card-subscription behavior. Fresh stateful journeys pass across all four tested viewports.

## Still open

- Rows marked `REVIEWED_FAIL` or `FUNCTIONALLY_VERIFIED` still require canonical visual approval.
- All 46 exact states now have dedicated tablet and desktop captures plus generated diffs. Responsive evidence does not by itself approve exact reference parity.
- Differences caused by intentional Velora branding are acceptable only after the resulting Velora composition itself is approved.

The row-by-row authority is [FINAL_SCREENSHOT_MATRIX.md](../testing/FINAL_SCREENSHOT_MATRIX.md); this summary must never be used to upgrade an individual row.
