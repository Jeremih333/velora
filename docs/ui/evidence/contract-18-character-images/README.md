# Section 18 character-image evidence

- Surface: production-build iPhone Telegram Mini App character editor.
- Fixture: approved `lighthouse.jpg`, intrinsic size `1600 x 900`.
- State: horizontal focal point `23%`, vertical focal point `77%`.
- Capture: `actual.png`.
- SHA-256: `8274F132EEF012F533664FD6900E27FF12AF29606864147B405C18D4B74189B9`.

The retained capture was inspected directly. The image preview keeps its aspect ratio through a
cover crop, both labelled range controls and their values are readable, helper copy wraps normally,
and the surface has no document-level horizontal overflow. The same journey saves and reloads the
focal values through the Worker API; component regressions separately cover portrait, landscape,
extreme-ratio and failed-load states.
