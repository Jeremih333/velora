# Web performance budget

Updated: 2026-08-14.

The previous production build emitted one 650,138-byte JavaScript entry. It crossed the reviewed
600 KB warning and loaded chat Markdown plus every authenticated administration/editor surface
before the user authenticated.

The measured build now has these uncompressed JavaScript artifacts:

| Artifact          | Loading boundary                  |      Size |
| ----------------- | --------------------------------- | --------: |
| initial entry     | landing/auth/i18n                 | 316,499 B |
| authenticated app | after successful Telegram auth    | 167,068 B |
| chat/Markdown     | only when a conversation opens    | 186,481 B |
| lorebook editor   | only when lorebooks are requested |  13,240 B |

The exact hashes change between builds. `toolkit/check-web-bundle.mjs` reads the generated Vite
manifest and fails the build if the initial entry or any JavaScript chunk exceeds 350,000 bytes,
or if the authenticated app, chats, or lorebooks stop being dynamic entries. The budget measures
uncompressed bytes, which is stricter and easier to reproduce than transport compression alone.

The responsive Playwright flow also proves that authentication loads the authenticated chunk,
does not fetch the chat chunk prematurely, and fetches it when the user opens Chats. Suspense
fallbacks use a visible status and respect reduced-motion preferences. This is a JavaScript loading
budget, not a claim about real-device network latency; production telemetry and a human Telegram
device matrix remain required before production readiness.

The discovery catalogue now uses server cursor pagination through `useInfiniteQuery`: it requests
20 cards initially and appends a page only after the user asks for more. The production-like E2E
proves the cursor is sent, the existing page remains, and duplicate cards are not introduced.
Catalogue/profile images use lazy loading and asynchronous decoding.

The long-chat browser regression loads 500 messages but keeps only the newest 80 in the DOM,
expands to 160 on one explicit request and leaves 340 hidden. It then branches/regenerates and edits
the active assistant message, reloads persisted memory and completes without a crash. Focused tests
also cover a 1,000-message window, the 100-entry Lorebook import maximum, a large manual-memory
editor and a 120-item model catalogue.

The exact build passed clean-clone CI `31560140067` and was deployed only to staging as Worker
`afd1e97d-1ab8-47cf-b0e5-e63b00e78686`. The manifest plus all four JavaScript files returned HTTP
200 with the sizes above; `/health` and `/ready` passed, and the unchanged D1 returned
`quick_check=ok` with no foreign-key violations. This does not authorize production deployment.
