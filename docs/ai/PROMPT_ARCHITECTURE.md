# Prompt architecture

Velora builds prompts server-side from typed, ordered segments:

1. platform safety;
2. platform generation instructions;
3. immutable character-version identity and definition;
4. creator instructions;
5. selected user Persona snapshot/live context;
6. pinned manual context;
7. automatic summary;
8. activated lore entries ordered by priority;
9. per-chat instructions (style, POV, pacing, narrative preferences);
10. dialogue examples;
11. bounded recent active-branch messages ending with the latest user message;
12. explicitly labelled post-history creator instructions, when configured.

The shared token estimator is used by editors, prompt assembly and the authorized prompt inspector. Each model profile supplies a context limit and reserved output budget. Lower-priority history is trimmed before invariant policy or character identity. User-provided syntax is treated as data and is never evaluated.

Generation persists the selected registry profile, provider/model reconciliation result, token accounting and finish metadata. Client-side model labels cannot override the server selection.

Response length is selected through four stable product presets. Their token ceilings are owned by
the Worker runtime registry, not by React: `SHORT` (400), `MEDIUM` (800), `DETAILED` (1,600), and
`LONG` (8,192). The effective output remains the minimum of the preset ceiling, the selected model
ceiling, and the conversation's explicit maximum, so a browser cannot request an unbounded answer.
The selected preset also contributes a server-owned response-length directive to the per-chat
instruction layer; it therefore affects both the hard output ceiling and the model prompt.
