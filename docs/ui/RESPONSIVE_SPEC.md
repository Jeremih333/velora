# Responsive specification

Velora uses five explicit product ranges. They are behavioral contracts rather than incidental
media queries: card density, navigation, overlays and chat geometry change together.

## Breakpoint behavior

| Range                                 | Product behavior                                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `320–479px` compact phone             | One character column at `320–359px`, two readable compact columns at `360–479px`; full-width chat; drawer is `82vw` and capped at `320px`; filter sheets leave only an 8px edge.             |
| `480–767px` smartphone                | Two character columns, fixed bottom navigation, a `320px` drawer, and near-full-width filter sheets.                                                                                         |
| `768–1023px` tablet portrait          | Three character columns, a fixed 320px drawer and a 400px right-side filter sheet (bounded to 420px).                                                                                        |
| `1024–1439px` tablet landscape/laptop | Four columns through 1199px and five from 1200px; 320px drawer; 420px side filter; active chat keeps a 260–300px conversation rail beside a chat bounded to 900px.                           |
| `1440px+` desktop                     | Max-width content, five columns (six from 1800px), 320px drawer and 420px side filter. Chat uses a 260–300px conversation rail, a bounded story surface and an optional 260–320px inspector. |

The compact single-column exception is intentional: two cards below 360px make controls and
names materially harder to read. Expanded character cards span the grid so their long-form
content is never squeezed into a narrow column.

## Supported verification viewports

- Exact contract journey: `320`, `360`, `600`, `820`, `1100`, `1280`, `1440` and `1800px`.
- iPhone mobile project: narrow Telegram WebView behavior.
- Android mobile project: narrow Telegram WebView behavior with Android browser metrics.
- Desktop project: keyboard/mouse behavior and widened content.

The device-project dimensions are defined in `playwright.config.ts`; reference dimensions remain
recorded per row in [SCREENSHOT_MANIFEST.yaml](SCREENSHOT_MANIFEST.yaml).

## Invariants

- No page-level horizontal overflow at any supported viewport.
- Fixed bottom navigation and the chat composer reserve their own safe-area space.
- Sheets fit within the visual viewport and keep an explicit close path available.
- Dense lists scroll inside their intended container; sticky actions must not cover the last item.
- Mobile cards collapse grids without squeezing labels into vertical letter columns.
- Character previews preserve intrinsic aspect ratio through a cover crop at the persisted focal
  point. Crop controls remain readable and operable at every supported width; extreme portrait or
  landscape files may warn but must not stretch or create horizontal overflow.
- Desktop overlays support Escape, visible close buttons and pointer navigation. Media/carousel
  states must never create a trap.
- The software keyboard may reduce the viewport, but the composer and active field remain
  reachable.
- Long chat paragraphs never expand to the full desktop viewport.
- Desktop chat keeps the active conversation highlighted in the left rail. Context, memory,
  prompt and settings share one collapsible right inspector; its close control and Escape both
  return the width to the story.
- When the Telegram keyboard opens, the conversation rail and inspector yield to the active story
  so the composer remains the only primary viewport surface.

Responsive status is tracked separately from visual parity in
[FINAL_SCREENSHOT_MATRIX.md](../testing/FINAL_SCREENSHOT_MATRIX.md).
