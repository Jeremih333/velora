# Bot Avatar response regression

## 2026-08-24 follow-up

- AvatarBot prompt assembly includes active character Lorebook entries and has an exact regression.
- Generation is inbound-only: bot-authored updates are ignored and groups require a direct reply.
- Visible operator smokes require both an environment confirmation and an explicit CLI flag.
- `deepseek-chat-v3-0324` passed the real Worker evaluation; unstable alternatives stay hidden.

Updated: 2026-08-23.

## 2026-08-24 production recheck

- Telegram reported zero pending updates for both `@aivel0ra_bot` and `@aliceneyrobot`;
- the main bot webhook points to `/telegram/webhook` and has no current Telegram error;
- the Alice bot exposes `start`, `help`, `info`, `memory`, `model`, and `clear` commands;
- a signed production `/info` update returned `processed`, followed by a signed private AI update
  returning `processed` and delivering through the real Alice bot token;
- Telegram retained a historical 503 marker from an older delivery. With the queue verified empty,
  the identical Alice webhook was re-confirmed; Telegram then reported the exact production URL,
  zero pending updates, and no `last_error_message`.

## 2026-08-24 Alice roleplay quality checkpoint

- the first controlled scene exposed that Alice was still explicitly configured for the economical
  `l3-lunaris-8b` route: it produced actions and plot movement, but inconsistent Russian;
- migration `0058_alice_balanced_model.sql` changes only the owner-operated Alice Character Bot to
  `velora-balanced`; no other bot or user conversation preference is changed;
- the post-migration production run used `deepseek-chat-v3.1`, completed with 2,260 input and 437
  output tokens, and persisted a 1,129-character response containing 22 asterisk action markers;
- manual text inspection confirmed coherent Russian, persistent Alice characterization, observable
  action, atmosphere and a new scene hook. D1 remained `quick_check=ok` with no FK violations.

## Root cause

The shared Character Bot webhook required every ordinary message to reply to the Telegram bot's
own message. That rule is correct for groups, but it also rejected ordinary private-chat messages.
User-authored character greetings and generated prose were additionally sent with unescaped
Telegram Markdown, so valid character text could be rejected by Telegram formatting rules. After
that routing fix, production diagnostics exposed two provider-bound defects: the AvatarBot used the
wrong `OPENAI_INCLUDE_USAGE` protocol instead of `BOTHUB_DOCUMENTED`, and passed Cloudflare's native
`fetch` into a class without the lexical wrapper required to preserve its platform calling contract.

## Fixed behaviour

- private chats accept ordinary text without a reply target;
- groups and supergroups still require a direct reply to the Character Bot;
- `/command@bot_username` is normalized like a regular Telegram command;
- `/info` explains private/group interaction and `/clear` clears only the current chat context;
- group context clearing remains owner-only;
- the provider receives at most eight earlier user messages from the same bot/chat context;
- BotHub uses the production-validated documented stream protocol and a lexical fetch wrapper;
- Telegram receives a `typing` action while generation starts;
- free-form character and model output is sent as plain text and bounded to 4000 characters;
- provider failures are persisted once, converted to safe user-facing replies and acknowledged to
  Telegram instead of triggering a silent webhook retry loop;
- the command menu is configured and confirmed through Telegram Bot API.

## Rejected legacy parts

The supplied Express/Puter/Puppeteer/file-JSON/card-payment implementation was not copied. It
conflicts with the single Cloudflare Worker architecture, signed D1 access, BotHub provider controls,
secret handling and the Telegram Stars-only digital billing rule.

## Evidence

- Character Bot unit regressions: 11/11 passed.
- Strict TypeScript, ESLint, production build, bundle budget and secret scan passed.
- Production Worker: `9e0d7488-9f1b-4caf-89cc-c2fa59828bf1`.
- Production health and D1 readiness passed.
- Telegram confirmed six commands for `@aliceneyrobot`.
- Telegram webhook points to the active VeloraAI Character Bot route, has zero pending updates and
  no last error.
- A signed production private `/info@aliceneyrobot` update returned `processed` and delivered the
  bot response without invoking a paid model.
- A bounded private ordinary-text smoke returned `processed`, delivered Alice's response and
  persisted `COMPLETED` for `deepseek-chat-v3.1`: 175 input tokens, 5 output tokens, 3434 ms and
  20080 cost micros. The two diagnostic failed attempts persisted zero cost.
