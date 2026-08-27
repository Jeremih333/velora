# Velora template engine

Velora expands roleplay templates inside the application before a prompt reaches a provider. The
renderer is deterministic, does not execute JavaScript and never uses `eval`.

## Documented variables

| Variable          | Meaning                                                                | Fallback                          |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------- |
| `{{char}}`        | Name from the immutable character version attached to the conversation | none                              |
| `{{user}}`        | Active Persona name                                                    | profile display name, then `User` |
| `{{persona}}`     | Active Persona name                                                    | empty string                      |
| `{{scenario}}`    | Scenario from the attached character version                           | empty string                      |
| `{{description}}` | Description from the attached character version                        | empty string                      |
| `{{memory}}`      | Active manual/automatic memory selected for the conversation           | empty string                      |

Prefix a token with a backslash to keep it literal: `\{{char}}` renders as `{{char}}`. Unknown or
malformed tokens remain visible and are reported to Prompt Inspector; they are never evaluated.

## Template-aware content

Templates are expanded in greetings and alternate greetings, character description, personality,
scenario, speech style, appearance, background, goals, behaviour rules, creator/system
instructions, post-history instructions, example dialogues, every Persona context field,
Lorebook entries, persistent memory and per-chat instructions.

Persona context is the complete prompt-facing Persona definition: short and full description,
personality, appearance, speaking style, background and private custom notes. A conversation stores
a Persona snapshot by default; LIVE mode deliberately reads the current Persona instead.

Every conversation stores a `character_version_id`. Editing a character creates a new immutable
version and moves only the character's `active_version_id`; existing conversations keep rendering
and generating against the version they started with.
