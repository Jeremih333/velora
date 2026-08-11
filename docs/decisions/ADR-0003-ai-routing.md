# ADR-0003: AI routing

Status: accepted for foundation; model quality must be re-evaluated before public launch.

Use an OpenAI-compatible provider abstraction with BotHub pay-as-you-go routing. The initial
quality candidates are DeepSeek V3.2 Speciale, Gemini 2.5 Flash and Claude Haiku 4.5. They remain
gated until a blind Russian/English roleplay evaluation and a minimal live accounting smoke.
Recurring payments and automatic top-up are forbidden; per-request and global budget ceilings are
mandatory. Only user-visible roleplay spends purchased Caps. Auxiliary AI uses Workers AI Free or
deterministic fallback.

BotHub is selected because the owner explicitly chose it, its documented gateway supports
OpenAI-compatible streaming, and the service advertises Russian cards/SBP with pay-as-you-go
billing. The key is a Worker secret. No balance purchase is automated.
