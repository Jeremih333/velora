# Velora design system

Velora uses its own dark, light and AMOLED themes. Reference screenshots inform density and interaction hierarchy but do not override Velora branding.

## Color tokens

The executable source of truth is `apps/web/src/styles.css`. The directional evidence is generated
from all 46 controlled screenshots in [REFERENCE_PALETTE_MEASUREMENT.md](./REFERENCE_PALETTE_MEASUREMENT.md):
728,160 sampled pixels show near-black/dark-neutral surfaces followed by the saturated blue action
family. Velora uses those measurements for hierarchy and density while keeping the product's
current monochrome identity instead of copying a reference brand.

| Semantic token       | Dark default              | Light                     |
| -------------------- | ------------------------- | ------------------------- |
| `--bg-primary`       | `#090a0c`                 | `#f2f3f4`                 |
| `--bg-secondary`     | `#141518`                 | `#d9dbde`                 |
| `--surface-1`        | `rgba(27,29,33,.88)`      | translucent white         |
| `--surface-2`        | `#202226`                 | white                     |
| `--surface-elevated` | `#292c31`                 | white                     |
| `--text-primary`     | `#f7f7f7`                 | `#111214`                 |
| `--text-secondary`   | `#d5d6d8`                 | `#34363a`                 |
| `--text-muted`       | `#b8bac0`                 | `#595d63`                 |
| `--brand-primary`    | `#e1e2e4`                 | `#25272b`                 |
| `--brand-hover`      | `#ffffff`                 | `#090a0c`                 |
| `--brand-active`     | `#a9acb1`                 | `#45484e`                 |
| `--rp-action`        | cool neutral accent       | dark neutral accent       |
| `--premium`          | silver premium accent     | graphite premium accent   |
| `--success`          | `#73e7bd`                 | `#176b4d`                 |
| `--warning`          | `#f6c75b`                 | `#795b05`                 |
| `--danger`           | `#ff9bad`                 | `#9f2f47`                 |
| `--border-subtle`    | translucent light neutral | translucent dark neutral  |
| `--border-strong`    | stronger light neutral    | stronger dark neutral     |
| `--shadow-popup`     | semantic popup elevation  | semantic popup elevation  |
| `--shadow-dialog`    | semantic dialog elevation | semantic dialog elevation |

- Dark, light and AMOLED override semantic values, not component selectors. Legacy short aliases
  resolve to the same semantic tokens while older surfaces are migrated.
- Components contain no literal hex/RGB colors. They consume semantic variables and bounded
  `color-mix()` derivatives; an integration regression enforces this rule.

## Typography

- `@fontsource-variable/noto-sans@5.3.0` and `@fontsource-variable/noto-serif@5.3.0`
  are pinned dependencies. The build ships only their Cyrillic and Latin normal/italic WOFF2
  subsets, so visual tests do not depend on fonts installed on the device or network font CDNs.
- Noto Sans is the body/control face. Noto Serif is the Velora editorial face for display surfaces;
  controls never depend on it for legibility. Both cover the current Russian and English locales.
- Every component `font-size` references a semantic `--type-*-size` token. An integration
  regression rejects literal px/rem font sizes and numeric font shorthands in component rules.
- Each required family defines size, weight, line-height and letter-spacing:

| Family       | Size                      | Weight | Line height | Letter spacing |
| ------------ | ------------------------- | -----: | ----------: | -------------: |
| `display`    | `clamp(42px, 11vw, 72px)` |    700 |        0.98 |     `-0.035em` |
| `heading-xl` | `clamp(30px, 7vw, 48px)`  |    700 |        1.05 |      `-0.02em` |
| `heading-lg` | `26px`                    |    700 |        1.12 |      `-0.01em` |
| `heading-md` | `22px`                    |    700 |         1.2 |     `-0.005em` |
| `body-lg`    | `16px`                    |    400 |        1.58 |            `0` |
| `body`       | `14px`                    |    400 |         1.5 |            `0` |
| `body-sm`    | `12px`                    |    400 |        1.45 |            `0` |
| `caption`    | `10px`                    |    700 |        1.35 |       `0.06em` |
| `button`     | `14px`                    |    800 |         1.2 |            `0` |
| `label`      | `11px`                    |    800 |        1.25 |       `0.08em` |
| `mono`       | `12px`                    |    500 |        1.45 |            `0` |

- Compact overlines, dense body copy and decorative cover marks use named extensions to this
  scale rather than page-local values. Text may wrap naturally; character-by-character wrapping,
  clipping and horizontal page overflow are defects.

## Spacing and shape

- All component `margin`, `padding` and `gap` declarations are composed from the executable scale
  `--space-2`, `4`, `6`, `8`, `12`, `16`, `20`, `24`, `32`, `40`, `48`, `64`.
- Large safe-area clearances and the landing hero minimum/maximum are named compositions of those
  tokens; they are not new arbitrary spacing values. Zero and `auto` retain their native meaning.
- A regression rejects literal px/rem lengths in component spacing declarations, including the
  retired random `13px`, `17px` and `21px` values.
- Touch targets are at least 44 CSS px where the platform permits.
- Every component radius comes from the executable semantic scale below. Literal pixel/rem radii in
  component rules are forbidden by an integration regression.

| Token             | Value   | Intended use                                    |
| ----------------- | ------- | ----------------------------------------------- |
| `--radius-xs`     | `6px`   | tiny indicators and compact nested details      |
| `--radius-sm`     | `10px`  | compact controls and media details              |
| `--radius-md`     | `14px`  | inputs, buttons and nested surfaces             |
| `--radius-lg`     | `18px`  | standard controls and compact cards             |
| `--radius-xl`     | `22px`  | large controls and sheets                       |
| `--radius-card`   | `24px`  | primary product cards                           |
| `--radius-dialog` | `28px`  | dialogs and prominent overlay surfaces          |
| `--radius-pill`   | `999px` | filters, status chips and intentionally pill UI |

- True circles may use `50%`; inherited or square geometry may use `inherit` or `0`.
- Cards and sheets use rounded surfaces; pills are reserved for compact filters, status and short actions.
- `env(safe-area-inset-*)` protects Telegram chrome, bottom navigation and the chat composer.

## Iconography

- `lucide-react` `1.31.0` is the single pinned icon set. Product code does not mix emoji,
  Unicode control glyphs, hand-written SVG or another icon library.
- `VeloraIcon` is the typed semantic registry for the authenticated product. The small unauthenticated
  shell imports the same Lucide set directly so lazy product chunks are not pulled into the initial
  bundle.
- The default visual size is 20 CSS px; compact metadata uses 16–18 px and prominent controls may use
  24 px. The interactive hit target remains approximately 44 × 44 CSS px or larger.
- SVGs are decorative (`aria-hidden`, non-focusable). The owning button or link carries the accessible
  label; state is also exposed through `aria-pressed`, `aria-expanded` or the relevant native role.
- Native browser affordances such as a select disclosure are platform controls, not product icons.
- An integration regression rejects the retired raw glyph set and raw `<svg>` markup in product call
  sites. Component tests verify SVG sizing and accessibility behavior.

## Motion and focus

- Focus is always visible for keyboard users.
- Overlay entrance/exit is short and does not block input.
- `prefers-reduced-motion` disables non-essential motion.
- Color is never the only selected/error indicator.
