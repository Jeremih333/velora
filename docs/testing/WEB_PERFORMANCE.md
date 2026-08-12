# Web performance budget

Updated: 2026-08-12.

The previous production build emitted one 650,138-byte JavaScript entry. It crossed the reviewed
600 KB warning and loaded chat Markdown plus every authenticated administration/editor surface
before the user authenticated.

The measured build now has these uncompressed JavaScript artifacts:

| Artifact          | Loading boundary                  |      Size |
| ----------------- | --------------------------------- | --------: |
| initial entry     | landing/auth/i18n                 | 306,635 B |
| authenticated app | after successful Telegram auth    | 148,982 B |
| chat/Markdown     | only when a conversation opens    | 183,811 B |
| lorebook editor   | only when lorebooks are requested |  13,225 B |

The exact hashes change between builds. `toolkit/check-web-bundle.mjs` reads the generated Vite
manifest and fails the build if the initial entry or any JavaScript chunk exceeds 350,000 bytes,
or if the authenticated app, chats, or lorebooks stop being dynamic entries. The budget measures
uncompressed bytes, which is stricter and easier to reproduce than transport compression alone.

The responsive Playwright flow also proves that authentication loads the authenticated chunk,
does not fetch the chat chunk prematurely, and fetches it when the user opens Chats. Suspense
fallbacks use a visible status and respect reduced-motion preferences. This is a JavaScript loading
budget, not a claim about real-device network latency; production telemetry and a human Telegram
device matrix remain required before production readiness.

The exact build passed clean-clone CI `31560140067` and was deployed only to staging as Worker
`afd1e97d-1ab8-47cf-b0e5-e63b00e78686`. The manifest plus all four JavaScript files returned HTTP
200 with the sizes above; `/health` and `/ready` passed, and the unchanged D1 returned
`quick_check=ok` with no foreign-key violations. This does not authorize production deployment.
