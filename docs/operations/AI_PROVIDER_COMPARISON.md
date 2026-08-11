# AI provider comparison — 9 August 2026

| Option                    | Payment fit                                                           | Roleplay fit                                        | Streaming                              | Decision                             |
| ------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| BotHub API                | Pay-as-you-go; Russian cards and SBP documented; owner funds manually | Broad catalogue; candidates require a blind RP test | OpenAI-compatible Chat Completions SSE | Selected by owner, integration gated |
| Workers AI Free           | No payment within daily Free allowance                                | Insufficient as the sole premium roleplay provider  | Model-dependent                        | Auxiliary summaries/moderation only  |
| Deterministic local logic | Free                                                                  | Cannot generate full roleplay                       | Not applicable                         | Memory/moderation degraded mode      |

BotHub uses `https://openai.bothub.chat/v1`. The API key is created in the developer cabinet and
stored only as `BOTHUB_API_KEY` in Cloudflare Secrets. Models are fetched from `/models`; none is
enabled merely because it appears there.

Before any real one-time purchase:

1. run a synthetic blind Russian/English roleplay suite on the candidate models;
2. make one minimal request and compare response usage, BotHub history and balance delta;
3. verify the key can be revoked and that no recurring payment or auto top-up is active;
4. show the owner the exact amount and offered payment method;
5. enable paid generation only after explicit approval.

Official sources: [BotHub introduction](https://bothub.ru/api/documentation/ru),
[quick start](https://bothub.ru/api/documentation/ru/our-api/quick-start),
[text generation](https://bothub.ru/api/documentation/ru/generation/text-generation), and
[model catalogue](https://bothub.ru/models).
