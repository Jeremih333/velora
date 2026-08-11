# Technical debt

No hidden shortcuts are accepted. Current explicit gaps:

- Telegram file IDs are the initial zero-card media store. Risk: file availability depends on Bot
  API and download limits. Replace/add R2 only after an acceptable human billing checkpoint.
- Model candidates are price-screened, not yet blind-quality-tested. Complete the synthetic
  Russian/English roleplay evaluation before purchasing credits.
- Free-plan scale is intentionally bounded. Exceeding hard Workers/D1/Queue limits causes degraded
  service; capacity alerts and admin messaging are required before public growth.
