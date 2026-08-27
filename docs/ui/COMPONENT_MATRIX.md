# Component matrix

| Surface           | Principal components                                      | Persistent domain dependency                      | Primary evidence                                  |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Discovery         | search, sort, filters, character cards                    | character catalogue and preferences               | `discovery-filter.test.ts`, integration API, E2E  |
| Character editor  | avatar, focal crop, identity, prompt fields, publish      | character drafts, avatar focal point and versions | component, Worker/D1 integration, E2E             |
| Character profile | focal hero, metadata, greeting, start story               | published character and conversation creation     | image component, Worker/D1 integration, E2E       |
| Personas          | list, editor, chooser                                     | persona ownership/default selection               | component, integration, E2E                       |
| Lorebooks         | list, editor, entries                                     | lorebooks and prompt activation                   | package tests, integration, E2E                   |
| Chats list        | search, sort, archive/manage                              | conversations and visible messages                | `conversation-list.test.ts`, integration, E2E     |
| Roleplay chat     | header, timeline, message actions, composer               | messages, generations, branches, memory and lore  | roleplay suite, integration, E2E                  |
| Model selection   | quick picker and full catalogue                           | D1 registry, policy and provider availability     | `model-registry.test.ts`, integration, E2E        |
| Pricing           | plan cards, fixed periods, Stars action                   | D1 plans/access packs and Telegram payment state  | billing tests, integration, E2E                   |
| Owner operations  | health, eval, model controls, capacity                    | owner-only server authorization and audit log     | RBAC/integration/E2E                              |
| Cross-cutting UI  | typed Lucide icon registry and shell icons                | pinned `lucide-react` package and semantic names  | icon component/contract tests, visual E2E         |
| Cross-cutting UI  | typography and spacing tokens                             | pinned local Noto fonts and canonical CSS scales  | contract regression, responsive visual E2E        |
| Cross-cutting UI  | measured semantic color palette                           | 46-reference aggregate and theme token overrides  | palette contract, light/dark/AMOLED visual E2E    |
| Cross-cutting UI  | app shell, top bar, drawer, bottom nav, toast, skeleton   | shared typed `CoreComponents` boundaries          | focused semantics/focus/close regressions and E2E |
| Cross-cutting UI  | exact 48-component master-contract inventory              | canonical live exports and Worker-backed state    | inventory contract, focused suites, iPhone E2E    |
| Cross-cutting UI  | intrinsic image geometry, cover crop and failure fallback | media metadata and persisted focal coordinates    | `CharacterImage.test.tsx`, integration and E2E    |

The exact canonical names and owners are listed in `../design/COMPONENT_INVENTORY.md`. No component
in this table is considered complete merely because it renders. Its named domain dependency and
corresponding integration evidence are required.
