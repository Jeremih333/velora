# Component inventory

The master UI contract names 48 reusable components. Every name below is an exact production
export, and `tests/integration/requirement-traceability.test.ts` rejects an exported-only component
that is not mounted by a live product surface.

| Group               | Required production exports                                                                                             | Owner                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Shell               | `AppShell`, `TopBar`, `SideDrawer`, `BottomNavigation`                                                                  | `apps/web/src/CoreComponents.tsx`               |
| Discovery           | `SearchBar`, `FilterButton`, `FilterSheet`, `SortDropdown`                                                              | `CoreComponents.tsx`, `ProductComponents.tsx`   |
| Characters          | `CharacterCard`, `CreatorCharacterCard`, `CharacterHero`, `TagChip`                                                     | `ProductComponents.tsx`, `AuthenticatedApp.tsx` |
| Personas            | `EntityTabs`, `PersonaCard`, `PersonaSelector`                                                                          | `CoreComponents.tsx`, `ProductComponents.tsx`   |
| Forms               | `FormField`, `TextAreaField`, `Counter`, `TokenCounter`, `SegmentedControl`, `Switch`, `Checkbox`                       | `CoreComponents.tsx`                            |
| Chat                | `ChatHeader`, `MessageList`, `MessageBubble`, `GreetingMessage`, `MessageActionMenu`, `ReactionPopover`, `ChatComposer` | `ChatComponents.tsx`, `CoreComponents.tsx`      |
| Models              | `ModelQuickPicker`, `ModelCatalog`, `ModelCard`                                                                         | `ChatComponents.tsx`                            |
| Memory              | `MemoryEditor`, `MemoryVersionList`                                                                                     | `ProductComponents.tsx`, `AuthenticatedApp.tsx` |
| Lore                | `LorebookCard`, `LorebookEditor`, `LorebookEntryEditor`, `LoreInspector`                                                | `LorebooksView.tsx`                             |
| Billing             | `PlanCard`, `PlanCarousel`                                                                                              | `ProductComponents.tsx`, `AuthenticatedApp.tsx` |
| Overlays and states | `Dialog`, `Sheet`, `Popover`, `Dropdown`, `Toast`, `Skeleton`, `ErrorState`, `EmptyState`                               | `CoreComponents.tsx`, `ProductComponents.tsx`   |

Compatibility aliases are allowed only for imports outside the live tree. Production JSX uses the
canonical names; the traceability regression explicitly rejects the retired `SortMenu`,
`ModelPicker`, `ModelCatalogDialog`, `MessageReactionPopover` and `PersonaChooser` JSX names.

`MemoryVersionList` is not decorative: it reads the version endpoint, identifies the active
version, restores a selected version through the idempotent Worker route and refreshes both the
editor and history. The main iPhone journey proves this round trip before continuing generation.

Focused semantics, keyboard and API regressions live in `CoreComponents.test.tsx`,
`ProductComponents.test.tsx`, `ChatComponents.test.tsx`, `LorebooksView.test.tsx`,
`ChatsView.selection.test.tsx` and `AuthenticatedApp.components.test.tsx`.
