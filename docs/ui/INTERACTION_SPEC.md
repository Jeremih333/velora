# Interaction specification

## Navigation

- Route changes preserve server-backed data and do not reset unrelated accordion/filter state.
- Telegram Back closes the topmost local layer first, then navigates within the app, then yields to Telegram.
- A visible navigation control always has a handler and an accessible name.

## Overlays and menus

- Open from an explicit trigger with `aria-expanded`/dialog semantics where applicable.
- Close with the close control, backdrop/outside click and Escape on desktop.
- Restore focus to the trigger after close.
- Never render underneath fixed Telegram/navigation chrome.

## Forms

- Validation is shown beside the field and summarized in the visible action area.
- Long editors recover drafts; server mutations expose pending, success and error states.
- Cancel returns without silently publishing or overwriting server state.

## Lists and carousels

- Touch uses swipe where natural; desktop has visible previous/next controls and keyboard support.
- Independent horizontal lists also accept wheel/trackpad input without creating page overflow.
- Selection is communicated by text/icon state in addition to color.

## Destructive actions

Deletion, account removal and destructive moderation require a scoped confirmation. The API rechecks identity and ownership; the client is never the authority.
