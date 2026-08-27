# Roleplay chat UI specification

## Layout

- The chat header identifies the active character/conversation and exposes model/story tools without covering the timeline.
- Messages are visually grouped by role and branch while preserving readable width.
- The composer remains above bottom navigation and safe-area insets.
- Long histories use a bounded window and preserve scroll position when older messages load.

### Desktop composition

At `1024px+`, opening a conversation keeps three coordinated zones rather than replacing the
library with a single oversized chat:

1. a scrollable `260–300px` conversation rail with the active story marked;
2. the bounded message timeline and composer;
3. one optional `260–320px` inspector for context/Lorebook, persistent memory, prompt inspection
   or per-story settings.

The inspector is mutually exclusive, closes through its named control or Escape, and does not
duplicate state outside the real query/mutation panels. Below `1024px` only the active story is
shown after selection. During a Telegram keyboard state, both side zones are hidden so the message
list and composer receive the complete safe viewport.

## Composer

- Text drafts survive a recoverable interruption.
- Send is disabled only for an explicit reason and reports that reason.
- Streaming exposes progress, stop and failure recovery without duplicating a paid generation.
- The current model is visible and the actual backend request uses its registry selection.

## Message actions

Copy, immutable edit/versioning, regenerate, continue, branch, reaction, report and delete are scoped to the exact message/generation. Outside click and Escape close menus. Reactions are idempotent and removable.

## Roleplay continuity

Prompt assembly combines platform policy, character, creator instructions, persona, memory, lore, chat instructions, examples and bounded recent history. The prompt inspector reports the same token partitions used for generation; it must not expose private prompt data to unauthorized users.

## Accessibility and failure

Messages remain selectable, controls have names, live generation updates do not steal focus, and provider/network failures leave the draft and previous history intact.
