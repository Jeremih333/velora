# Final human Telegram device pass

Updated: 25 August 2026.

| Host             | Status          | Current evidence / required checkpoint                                                                                                                                                                                |
| ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram Android | BLOCKED         | The current production bundle passes the complete 46-state Android Playwright journey without retries, but a human must verify it in real Telegram, including safe areas, keyboard, modal, chat and profile.          |
| Telegram iOS     | BLOCKED         | The current production bundle passes the complete 46-state iPhone/WebKit Playwright journey without retries, but a human must verify it in real Telegram, including safe areas, keyboard, modal, chat and profile.    |
| Telegram Desktop | PASS_WITH_SCOPE | The owner completed production `/start` and Mini App authentication and earlier confirmed the real continuation/branch UI. The newest cosmetic header change has automated desktop proof, not a new human screenshot. |
| Telegram Web     | BLOCKED         | The current production bundle passes the complete desktop Playwright journey without retries, but no explicit current-build Telegram Web human checkpoint is recorded.                                                |

`PASS_WITH_SCOPE` is not equivalent to a complete four-host pass. The product must not be described
as 100% visually accepted until the three blocked rows are performed and recorded against the
current production version.

The human reviewer should record the production version, Telegram client/platform version, device
or viewport, locale/theme, result and any screenshot or issue reference. No private chat content,
Telegram `initData`, bot token or session material may be stored as evidence.
