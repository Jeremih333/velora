# Technical debt

No hidden shortcuts are accepted. Current explicit gaps:

- Telegram file IDs are the initial zero-card media store. Risk: file availability depends on Bot
  API and download limits. Replace/add R2 only after an acceptable human billing checkpoint.
- The six-case Russian/English A-F corpus verifies production prompt assembly without provider
  spend, and the selected `deepseek-chat-v3.1` path passed one bounded provider checkpoint plus one
  owner-confirmed live staging conversation. A statistically broad, paid blind prose-quality
  comparison between additional model candidates still requires a separate owner-approved budget;
  no unverified model is enabled merely to close this gap.
- Free-plan scale is intentionally bounded. Privacy-safe alerts already cover AI budget/error
  thresholds, dead jobs, erasure failures and repeated Telegram failures, with confirmed owner
  delivery and an admin view. The read-only `toolkit/cloudflare-free-usage.mjs` guard checks
  account-wide Workers requests plus D1 rows, storage and database count at 70%/85% boundaries.
  Cloudflare documents GraphQL analytics as operational rather than billing-authoritative and it
  may be adaptively sampled, so public growth still requires a human review of Billing > Billable
  Usage whenever the guard warns or fails closed. Hard quota exhaustion must continue to degrade
  explicitly and must never trigger a paid Cloudflare upgrade.
