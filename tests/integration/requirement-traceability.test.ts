import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('master-brief requirement traceability', () => {
  it('keeps the complete UI/AI/operations specification pack and exact 46-row manifest schema', async () => {
    const requiredDocuments = [
      '../../docs/ui/UI_SPEC.md',
      '../../docs/ui/DESIGN_SYSTEM.md',
      '../../docs/ui/COMPONENT_MATRIX.md',
      '../../docs/ui/RESPONSIVE_SPEC.md',
      '../../docs/ui/INTERACTION_SPEC.md',
      '../../docs/ui/CHAT_UI_SPEC.md',
      '../../docs/ui/VISUAL_QA.md',
      '../../docs/ui/COPY_CATALOG.md',
      '../../docs/ui/FINAL_VISUAL_REPORT.md',
      '../../docs/testing/FINAL_TEST_REPORT.md',
      '../../docs/testing/FINAL_HUMAN_DEVICE_PASS.md',
      '../../docs/testing/RELEASE_BLOCKERS.md',
      '../../docs/ai/MODEL_CATALOG.md',
      '../../docs/ai/MODEL_EVALS.md',
      '../../docs/ai/FINAL_AI_REPORT.md',
      '../../docs/ai/PROMPT_ARCHITECTURE.md',
      '../../docs/ai/MEMORY_ARCHITECTURE.md',
      '../../docs/ai/LOREBOOK_ARCHITECTURE.md',
      '../../docs/operations/CLOUDFLARE_LIMITS.md',
      '../../docs/operations/BOTHUB_COST_MODEL.md',
      '../../docs/operations/PRODUCTION_CHECKLIST.md',
    ] as const;
    const documents = await Promise.all(
      requiredDocuments.map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
    );
    for (const document of documents) {
      expect(document.trim().length).toBeGreaterThan(120);
    }

    const manifest = await readFile(
      new URL('../../docs/ui/SCREENSHOT_MANIFEST.yaml', import.meta.url),
      'utf8',
    );
    expect(manifest).toContain('reference_count: 46');
    const requiredKeys = [
      'id',
      'reference',
      'route',
      'fixture',
      'viewport',
      'preconditions',
      'actions',
      'requiredComponents',
      'requiredStrings',
      'requiredControls',
      'expectedState',
      'logicTests',
      'visualTest',
      'responsiveTests',
      'status',
    ] as const;
    for (const key of requiredKeys) {
      const indentation = key === 'id' ? '  - ' : '    ';
      const matches = manifest.match(new RegExp(`^${indentation}${key}:`, 'gmu')) ?? [];
      expect(matches, `${key} must exist once for each controlled reference`).toHaveLength(46);
    }
  });

  it('keeps non-empty phone, tablet, and desktop evidence for all 46 visual references', async () => {
    const evidenceFiles = Array.from({ length: 46 }, (_, index) => {
      const id = String(index + 1).padStart(2, '0');
      return [
        'expected.jpg',
        'actual.png',
        'diff.png',
        'actual-tablet.png',
        'diff-tablet.png',
        'actual-desktop.png',
        'diff-desktop.png',
      ].map((name) => new URL(`../../docs/ui/evidence/ui-${id}/${name}`, import.meta.url));
    }).flat();
    const evidenceStats = await Promise.all(evidenceFiles.map((file) => stat(file)));
    expect(evidenceStats).toHaveLength(46 * 7);
    for (const evidence of evidenceStats) {
      expect(evidence.isFile()).toBe(true);
      expect(evidence.size).toBeGreaterThan(0);
    }
  });

  it('keeps every component radius on the canonical semantic scale', async () => {
    const styles = await readFile(
      new URL('../../apps/web/src/styles.css', import.meta.url),
      'utf8',
    );
    for (const token of ['xs', 'sm', 'md', 'lg', 'xl', 'card', 'dialog', 'pill']) {
      expect(styles).toMatch(new RegExp(`--radius-${token}:\\s*[^;]+;`, 'u'));
    }
    const declarations = [...styles.matchAll(/border-radius:\s*([^;]+);/gu)].map(
      (match) => match[1] ?? '',
    );
    expect(declarations.length).toBeGreaterThan(100);
    for (const declaration of declarations) {
      expect(declaration).not.toMatch(/\d+(?:px|rem)/u);
      expect(declaration).toMatch(/var\(--radius-|50%|inherit|^0$/u);
    }
  });

  it('defines every CSS custom property consumed by the product shell', async () => {
    const styles = await readFile(
      new URL('../../apps/web/src/styles.css', import.meta.url),
      'utf8',
    );
    const definitions = new Set(
      [...styles.matchAll(/(--[a-z0-9-]+)\s*:/giu)].map((match) => match[1]),
    );
    const usages = new Set([...styles.matchAll(/var\((--[a-z0-9-]+)/giu)].map((match) => match[1]));
    const undefinedProperties = [...usages]
      .filter((property) => property !== undefined && !definitions.has(property))
      .sort();

    expect(undefinedProperties).toEqual([]);
  });

  it('keeps model pickers content-sized and pinned to the product typeface', async () => {
    const styles = await readFile(
      new URL('../../apps/web/src/styles.css', import.meta.url),
      'utf8',
    );

    expect(styles).toMatch(
      /\.chat-model-picker,\s*\.model-catalog-dialog\s*\{[\s\S]*?font-family:\s*var\(--font-sans\);/u,
    );
    expect(styles).toMatch(
      /\.chat-model-picker-list,\s*\.model-catalog-list\s*\{[\s\S]*?grid-auto-rows:\s*max-content;/u,
    );
    expect(styles).toMatch(
      /\.chat-model-picker-list > button\s*\{[\s\S]*?height:\s*auto;[\s\S]*?font:\s*inherit;/u,
    );
    expect(styles).toMatch(/\.model-availability\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/u);
  });

  it('locks all five responsive product ranges and their concrete layout behavior', async () => {
    const [styles, specification] = await Promise.all([
      readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8'),
      readFile(new URL('../../docs/ui/RESPONSIVE_SPEC.md', import.meta.url), 'utf8'),
    ]);

    for (const range of [
      '@media (min-width: 320px) and (max-width: 479px)',
      '@media (min-width: 480px) and (max-width: 767px)',
      '@media (min-width: 768px) and (max-width: 1023px)',
      '@media (min-width: 1024px) and (max-width: 1439px)',
      '@media (min-width: 1440px)',
    ]) {
      expect(styles).toContain(range);
    }
    for (const range of ['320–479px', '480–767px', '768–1023px', '1024–1439px', '1440px+']) {
      expect(specification).toContain(range);
    }

    expect(styles).toContain('width: min(82vw, 320px)');
    expect(styles).toContain('width: min(68vw, 344px)');
    expect(styles).toMatch(
      /\.chat-dialog-backdrop:has\(\.filter-sheet\)\s*\{[\s\S]*?place-items:\s*stretch end;/u,
    );
    expect(styles).toContain('width: 320px');
    expect(styles).toContain('width: 400px');
    expect(styles).toContain('width: 420px');
    expect(styles).toContain('max-width: 900px');
    expect(styles).toContain('repeat(6, minmax(0, 1fr))');
    expect(styles).toMatch(
      /@media \(min-width: 320px\) and \(max-width: 359px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/u,
    );
  });

  it('keeps desktop chat as conversations, story, and a collapsible inspector', async () => {
    const [source, styles] = await Promise.all([
      readFile(new URL('../../apps/web/src/ChatsView.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('className="desktop-chat-workspace"');
    expect(source).toContain('className="desktop-conversation-pane"');
    expect(source).toContain("chat-view${inspectorOpen ? ' has-inspector' : ''}");
    expect(source).toContain('className="chat-inspector-slot"');
    expect(source).toContain('translations.chat.closeInspector');
    for (const panel of [
      '<LoreInspector conversationId={conversationId} />',
      '<ChatMemoryPanel conversationId={conversationId} />',
      '<ChatPromptInspector conversationId={conversationId} />',
      '<ChatSettingsPanel',
    ]) {
      expect(source).toContain(panel);
    }

    expect(styles).toMatch(
      /@media \(min-width: 1024px\)[\s\S]*?\.desktop-chat-workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(260px, 300px\) minmax\(0, 900px\)/u,
    );
    expect(styles).toMatch(
      /\.desktop-chat-workspace \.chat-view\.has-inspector > \.chat-inspector-slot\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?grid-row:\s*3 \/ 6/u,
    );
    expect(styles).toContain('.conversation-card.is-active');
  });

  it('uses pinned Cyrillic-capable fonts and semantic typography tokens', async () => {
    const [styles, packageSource] = await Promise.all([
      readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/package.json', import.meta.url), 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const requiredTokens = [
      'display',
      'heading-xl',
      'heading-lg',
      'heading-md',
      'body-lg',
      'body',
      'body-sm',
      'caption',
      'button',
      'label',
      'mono',
    ] as const;

    expect(packageJson.dependencies?.['@fontsource-variable/noto-sans']).toBe('5.3.0');
    expect(packageJson.dependencies?.['@fontsource-variable/noto-serif']).toBe('5.3.0');
    expect(styles).toContain('noto-sans-cyrillic-wght-normal.woff2');
    expect(styles).toContain('noto-serif-cyrillic-wght-normal.woff2');
    for (const token of requiredTokens) {
      for (const property of ['size', 'weight', 'line-height', 'letter-spacing']) {
        expect(styles).toMatch(new RegExp(`--type-${token}-${property}:\\s*[^;]+;`, 'u'));
      }
    }

    const fontSizes = [...styles.matchAll(/font-size:\s*([^;]+);/gu)].map(
      (match) => match[1]?.trim() ?? '',
    );
    expect(fontSizes.length).toBeGreaterThan(100);
    for (const fontSize of fontSizes) expect(fontSize).toMatch(/^var\(--type-[a-z-]+-size\)$/u);

    const fontShorthands = [...styles.matchAll(/(?:^|\s)font:\s*([^;]+);/gmu)].map(
      (match) => match[1]?.trim() ?? '',
    );
    expect(fontShorthands.every((value) => value === 'inherit')).toBe(true);
  });

  it('keeps component spacing on the canonical scale', async () => {
    const styles = await readFile(
      new URL('../../apps/web/src/styles.css', import.meta.url),
      'utf8',
    );
    for (const token of [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64]) {
      const value = String(token);
      expect(styles).toMatch(new RegExp(`--space-${value}:\\s*${value}px;`, 'u'));
    }

    const spacingProperty =
      /^(?:margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|gap|row-gap|column-gap)$/u;
    const declarations = [...styles.matchAll(/([a-z-]+):\s*([^;]+);/gu)]
      .filter((match) => spacingProperty.test(match[1] ?? ''))
      .map((match) => match[2]?.trim() ?? '');
    expect(declarations.length).toBeGreaterThan(500);
    for (const declaration of declarations) {
      expect(declaration).not.toMatch(/-?\d+(?:\.\d+)?(?:px|rem)\b/u);
    }
  });

  it('uses Telegram viewport variables instead of component-level viewport units', async () => {
    const styles = await readFile(
      new URL('../../apps/web/src/styles.css', import.meta.url),
      'utf8',
    );
    expect(styles).toContain('--velora-viewport-height: 100dvh;');
    expect(styles).toContain('--velora-viewport-stable-height: 100dvh;');
    expect(styles.match(/100(?:d|s|l)?vh/gu)).toHaveLength(2);
    expect(styles).toContain("html[data-telegram-keyboard='open'] .chat-view");
    expect(styles).toContain("html[data-telegram-keyboard='open'] .message-list");
    expect(styles).toContain("html[data-telegram-keyboard='open'] .chat-composer");
  });

  it('uses a measured semantic palette without component-local color literals', async () => {
    const [styles, measurement, packageSource] = await Promise.all([
      readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8'),
      readFile(new URL('../../docs/ui/REFERENCE_PALETTE_MEASUREMENT.md', import.meta.url), 'utf8'),
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      readonly devDependencies?: Readonly<Record<string, string>>;
    };
    const requiredTokens = [
      'bg-primary',
      'bg-secondary',
      'surface-1',
      'surface-2',
      'surface-elevated',
      'text-primary',
      'text-secondary',
      'text-muted',
      'brand-primary',
      'brand-hover',
      'brand-active',
      'rp-action',
      'premium',
      'success',
      'warning',
      'danger',
      'border-subtle',
      'border-strong',
      'shadow-popup',
      'shadow-dialog',
    ] as const;

    expect(packageJson.devDependencies?.['sharp']).toBe('0.35.2');
    expect(measurement).toContain('Sampled pixels: 728,160.');
    expect(measurement.match(/^\| `photo_\d+\.jpg`/gmu)).toHaveLength(46);
    const measuredReferences = [
      ...measurement.matchAll(
        /^\|\s+`(photo_\d+\.jpg)`\s+\|\s+`#[0-9a-f]{6}`\s+\|\s+[^|]+\|\s+`([0-9a-f]{64})`\s+\|$/gmu,
      ),
    ];
    expect(measuredReferences).toHaveLength(46);
    await Promise.all(
      measuredReferences.map(async ([, fileName = '', expectedHash = '']) => {
        const source = await readFile(
          new URL(`../../docs/ui/reference/${fileName}`, import.meta.url),
        );
        expect(createHash('sha256').update(source).digest('hex')).toBe(expectedHash);
      }),
    );
    for (const token of requiredTokens) {
      expect(styles).toMatch(new RegExp(`--${token}:\\s*[^;]+;`, 'u'));
    }

    const directColorPattern =
      /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]+\)|(?<![a-z-])(?:white|black)(?![a-z-])/gu;
    for (const [, rawSelector = '', body = ''] of styles.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
      const selector = rawSelector.trim().replace(/\s+/gu, ' ');
      if (selector === ':root' || /^\[data-theme='(?:dark|light|amoled)'\]$/u.test(selector)) {
        continue;
      }
      expect(body.match(directColorPattern), `component colors in ${selector}`).toBeNull();
    }
    expect(styles).not.toContain('var(--color-on-brand)-space');
  });

  it('uses one pinned Lucide icon system instead of mixed emoji and Unicode controls', async () => {
    const productionSources = await Promise.all(
      [
        '../../apps/web/src/App.tsx',
        '../../apps/web/src/AuthenticatedApp.tsx',
        '../../apps/web/src/ChatComponents.tsx',
        '../../apps/web/src/ChatsView.tsx',
        '../../apps/web/src/CoreComponents.tsx',
        '../../apps/web/src/LorebooksView.tsx',
        '../../apps/web/src/ProductComponents.tsx',
        '../../apps/web/src/i18n.tsx',
        '../../apps/web/src/styles.css',
      ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
    );
    const [iconSource, packageSource] = await Promise.all([
      readFile(new URL('../../apps/web/src/VeloraIcon.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/package.json', import.meta.url), 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const forbiddenGlyphs = [
      '⌂',
      '⌕',
      '⌄',
      '⌃',
      '✓',
      '−',
      '★',
      '⭐',
      '☰',
      '🛡',
      '✦',
      '＋',
      '▤',
      '◉',
      '⋮',
      '⧉',
      '✎',
      '⑂',
      '↻',
      'ⓘ',
      '⚑',
      '⌫',
      '←',
      '↓',
      '👍',
      '👎',
      '✨',
      '⚙',
      '♢',
      '◎',
      '□',
      '×',
      '›',
      '‹',
      '⋯',
      '→',
      '⊘',
      '◇',
      '◐',
      '↪',
      '◈',
      '∞',
      '◒',
      '⌁',
      '⌘',
      '♥',
      '♡',
      '🔖',
      '♧',
      '↗',
      '⇩',
      '◫',
      '🗑',
      '■',
      '➤',
      '●',
    ] as const;
    const productionSource = productionSources.join('\n');

    expect(packageJson.dependencies?.['lucide-react']).toBe('1.31.0');
    expect(iconSource).toContain("from 'lucide-react'");
    expect(iconSource).toContain('satisfies Readonly<Record<string, LucideIcon>>');
    expect(iconSource).toContain('aria-hidden="true"');
    expect(iconSource).toContain('focusable="false"');
    expect(iconSource.match(/^\s{2}[a-z][A-Za-z]+:/gmu)?.length ?? 0).toBeGreaterThan(30);
    expect(productionSource).not.toMatch(/<(?:svg|path|circle)\b/u);
    for (const glyph of forbiddenGlyphs) expect(productionSource).not.toContain(glyph);
  });

  it('keeps every required core component exported and used by the live product', async () => {
    const componentFiles = {
      '../../apps/web/src/CoreComponents.tsx': [
        'AppShell',
        'TopBar',
        'SideDrawer',
        'BottomNavigation',
        'SearchBar',
        'FilterButton',
        'EntityTabs',
        'FormField',
        'TextAreaField',
        'Counter',
        'TokenCounter',
        'SegmentedControl',
        'Switch',
        'Checkbox',
        'GreetingMessage',
        'Dialog',
        'Sheet',
        'Popover',
        'Toast',
        'Skeleton',
        'ErrorState',
        'EmptyState',
      ],
      '../../apps/web/src/ProductComponents.tsx': [
        'FilterSheet',
        'SortDropdown',
        'Dropdown',
        'PersonaCard',
        'MemoryEditor',
        'MemoryVersionList',
        'PlanCard',
        'PlanCarousel',
      ],
      '../../apps/web/src/ChatComponents.tsx': [
        'ChatHeader',
        'MessageList',
        'MessageBubble',
        'MessageActionMenu',
        'ReactionPopover',
        'ChatComposer',
        'ModelQuickPicker',
        'ModelCatalog',
        'ModelCard',
      ],
      '../../apps/web/src/AuthenticatedApp.tsx': [
        'CharacterCard',
        'CreatorCharacterCard',
        'CharacterHero',
        'TagChip',
        'PersonaSelector',
      ],
      '../../apps/web/src/LorebooksView.tsx': [
        'LorebookCard',
        'LorebookEditor',
        'LorebookEntryEditor',
      ],
      '../../apps/web/src/ChatsView.tsx': ['LoreInspector'],
    } as const;
    const entries = await Promise.all(
      Object.entries(componentFiles).map(async ([path, components]) => ({
        path,
        components,
        source: await readFile(new URL(path, import.meta.url), 'utf8'),
      })),
    );
    const productionSource = entries.map((entry) => entry.source).join('\n');

    for (const { path, components, source } of entries) {
      for (const component of components) {
        expect(source, `${component} must be exported from ${path}`).toMatch(
          new RegExp(`export (?:function|const) ${component}\\b`, 'u'),
        );
        expect(productionSource, `${component} must be used by a production component`).toMatch(
          new RegExp(`<${component}\\b`, 'u'),
        );
      }
    }

    for (const retiredUsage of [
      'SortMenu',
      'ModelPicker',
      'ModelCatalogDialog',
      'MessageReactionPopover',
      'PersonaChooser',
    ]) {
      expect(productionSource).not.toMatch(new RegExp(`<${retiredUsage}\\b`, 'u'));
    }
  });

  it('contains exactly one auditable row for every numbered section 0 through 178', async () => {
    const source = await readFile(
      new URL('../../docs/testing/REQUIREMENT_TRACEABILITY.md', import.meta.url),
      'utf8',
    );
    const sectionNumbers = [...source.matchAll(/^\|\s*(\d+)\s*\|/gmu)].map((match) =>
      Number(match[1]),
    );

    expect(sectionNumbers).toEqual(Array.from({ length: 179 }, (_, index) => index));
  });

  it('contains exactly one honest row for every UI master-contract section 0 through 216', async () => {
    const source = await readFile(
      new URL('../../docs/testing/UI_MASTER_CONTRACT_TRACEABILITY.md', import.meta.url),
      'utf8',
    );
    const sectionNumbers = [...source.matchAll(/^\|\s*(\d+)\s*\|/gmu)].map((match) =>
      Number(match[1]),
    );

    expect(sectionNumbers).toEqual(Array.from({ length: 217 }, (_, index) => index));
    expect(source).toContain('NOT_VERIFIED');
    expect(source).toMatch(/^\|\s*216\s+\|.*\| NOT_VERIFIED \|$/mu);
  });

  it('does not call the remaining production checkpoints complete', async () => {
    const source = await readFile(
      new URL('../../docs/testing/REQUIREMENT_TRACEABILITY.md', import.meta.url),
      'utf8',
    );

    expect(source).toContain('| 45  | Telegram Stars');
    expect(source).toContain('| 130 | Telegram bootstrap');
    expect(source).toContain('| 132 | Production smoke');
    expect(source).toContain('| 137 | Global Definition of Done');
    expect(source).toContain('BLOCKED_HUMAN');
    expect(source).toContain('PARTIAL');
    expect(source).not.toContain('| 137 | Global Definition of Done                | VERIFIED ');
  });

  it('keeps the mandatory release levels and complete defect taxonomy in policy', async () => {
    const [agents, acceptance, incidents] = await Promise.all([
      readFile(new URL('../../AGENTS.md', import.meta.url), 'utf8'),
      readFile(new URL('../../docs/testing/ACCEPTANCE_CRITERIA.md', import.meta.url), 'utf8'),
      readFile(new URL('../../docs/operations/INCIDENT_RESPONSE.md', import.meta.url), 'utf8'),
    ]);

    for (const level of [
      'NOT_IMPLEMENTED',
      'IMPLEMENTED',
      'FUNCTIONALLY_VERIFIED',
      'VISUALLY_VERIFIED',
      'PRODUCTION_VERIFIED',
      'RELEASE_GATES_PASS',
    ]) {
      expect(agents).toContain(level);
      expect(acceptance).toContain(level);
    }

    for (const defect of [
      'authentication bypass',
      'secret exposure',
      'duplicated payment',
      'data loss',
      'arbitrary account access',
      'chat is broken',
      'memory is corrupted',
      'Lorebook activates incorrectly',
      'Telegram Back is broken',
      'composer is inaccessible',
      'paid AI generation can be duplicated',
      'significant visual regression',
      'broken responsive screen',
      'important text clipping',
    ]) {
      expect(incidents).toContain(defect);
    }
  });

  it('keeps human checkpoints explicit and secret entry hidden', async () => {
    const [checkpoint, bothubInstaller, telegramInstaller] = await Promise.all([
      readFile(new URL('../../docs/operations/HUMAN_CHECKPOINTS.md', import.meta.url), 'utf8'),
      readFile(new URL('../../toolkit/set-bothub-key.ps1', import.meta.url), 'utf8'),
      readFile(new URL('../../toolkit/set-telegram-token.ps1', import.meta.url), 'utf8'),
    ]);

    for (const heading of [
      'HUMAN CHECKPOINT',
      'Причина:',
      'Уже подготовлено:',
      'Нужно от владельца:',
      'Не публикуйте секрет в GitHub или чате.',
      'После этого:',
    ]) {
      expect(checkpoint).toContain(heading);
    }
    for (const checkpointClass of [
      /Cloudflare\s+login/u,
      /GitHub\s+OAuth/u,
      /BotFather/u,
      /Telegram\s+bot\s+tokens/u,
      /BotHub\s+API\s+keys/u,
      /CAPS\s+purchases/u,
      /Telegram\s+Stars\s+payments/u,
      /domain\s+purchases/u,
    ]) {
      expect(checkpoint).toMatch(checkpointClass);
    }

    expect(bothubInstaller).toContain(
      'Read-Host "Вставьте API-ключ BotHub (ввод скрыт)" -AsSecureString',
    );
    expect(bothubInstaller).toContain('wrangler secret put BOTHUB_API_KEY');
    expect(telegramInstaller).toContain(
      'Read-Host "Вставьте токен нового Velora-бота" -AsSecureString',
    );
    expect(telegramInstaller).toContain('wrangler secret put TELEGRAM_BOT_TOKEN');
    const parameterBlockPattern = /^param\([\s\S]*?^\)/mu;
    const bothubParameters = parameterBlockPattern.exec(bothubInstaller)?.[0] ?? '';
    const telegramParameters = parameterBlockPattern.exec(telegramInstaller)?.[0] ?? '';
    expect(bothubParameters).not.toMatch(/ApiKey/iu);
    expect(telegramParameters).not.toMatch(/Token/iu);
  });

  it('persists and renders bounded character image focal points across every character surface', async () => {
    const [migration, domain, characterApi, discoveryApi, conversationApi, image, editor, media] =
      await Promise.all([
        readFile(
          new URL('../../migrations/0036_character_avatar_focal_point.sql', import.meta.url),
          'utf8',
        ),
        readFile(new URL('../../packages/domain/src/index.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/character-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/discovery-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/conversation-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/CharacterImage.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/AuthenticatedApp.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/telegram-media.ts', import.meta.url), 'utf8'),
      ]);

    expect(migration).toContain('avatar_focal_x REAL NOT NULL DEFAULT 50');
    expect(migration).toContain('avatar_focal_y REAL NOT NULL DEFAULT 50');
    expect(domain).toContain('avatarFocalX: z.number().min(0).max(100)');
    expect(domain).toContain('avatarFocalY: z.number().min(0).max(100)');
    for (const source of [characterApi, discoveryApi, conversationApi]) {
      expect(source).toContain('avatar_focal_x');
      expect(source).toContain('avatar_focal_y');
    }
    expect(image).toContain("objectFit: 'cover'");
    expect(image).toContain('objectPosition:');
    expect(image).toContain('naturalWidth');
    expect(image).toContain('naturalHeight');
    expect(image).toContain('onError');
    expect(editor).toContain('name="avatarFocalX"');
    expect(editor).toContain('name="avatarFocalY"');
    expect(editor).toContain('CharacterCropControl');
    expect(media).toContain('const maxImageBytes = 10_000_000');
    expect(media).toContain('const maxImageDimension = 8_192');
    expect(media).toContain('const maxImagePixels = 40_000_000');
  });

  it('implements section 19 as binary client preprocessing plus private R2 storage', async () => {
    const [client, uploadControl, mediaRoutes, bindings, accountControls] = await Promise.all([
      readFile(new URL('../../apps/web/src/image-upload.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/src/ImageUploadControl.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/api/src/media-routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/api/wrangler.jsonc', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/api/src/account-controls.ts', import.meta.url), 'utf8'),
    ]);

    expect(client).toContain('validateClientImage(file)');
    expect(client).toContain('calculateCoverCrop');
    expect(client).toContain("canvasToBlob(canvas, 'image/webp'");
    expect(client).toContain("canvasToBlob(canvas, 'image/jpeg'");
    expect(client).toContain('maxOutputWidth ?? 1_600');
    expect(uploadControl).toContain('body: prepared.blob');
    expect(uploadControl).not.toMatch(/FileReader|readAsDataURL|base64/u);
    expect(mediaRoutes).toContain('context.req.arrayBuffer()');
    expect(mediaRoutes).toContain('inspected?.mimeType !== declaredMimeType');
    expect(mediaRoutes).toContain(
      'const objectKey = `images/${principal.userId}/${id}.${extension}`',
    );
    expect(mediaRoutes).toContain("storageProvider: 'R2'");
    expect(mediaRoutes).not.toMatch(/INSERT INTO file_objects[\s\S]{0,500}base64/u);
    expect(bindings).toContain('"binding": "MEDIA_BUCKET"');
    expect(accountControls).toContain('await mediaBucket.delete');
  });

  it('bounds sections 28 and 29 to the required prompt layers and a 32k active context', async () => {
    const [promptBuilder, generationRoutes, promptSpecification] = await Promise.all([
      readFile(new URL('../../packages/prompts/src/index.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/api/src/generation-routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../docs/ai/PROMPT_ARCHITECTURE.md', import.meta.url), 'utf8'),
    ]);

    const orderedPromptLayers = [
      'CHARACTER_DEFINITION',
      'CREATOR_INSTRUCTIONS',
      'USER_PERSONA',
      'PERSISTENT_MEMORY',
      'ACTIVE_LORE',
      'CHAT_INSTRUCTIONS',
    ] as const;
    let previousIndex = promptBuilder.indexOf('const sections = [');
    expect(previousIndex).toBeGreaterThan(-1);
    for (const layer of orderedPromptLayers) {
      const index = promptBuilder.indexOf(layer);
      expect(index, `${layer} must be assembled server-side`).toBeGreaterThan(-1);
    }
    for (const layer of [
      'characterSection',
      'creatorInstructionsSection',
      'personaSection',
      'memorySection',
      'loreSection',
      'chatInstructionsSection',
    ]) {
      const index = promptBuilder.indexOf(layer, previousIndex);
      expect(index, `${layer} must preserve prompt precedence`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(promptBuilder).toContain(
      'for (let index = input.history.length - 1; index >= 0; index -= 1)',
    );
    expect(promptBuilder).toContain('selected.unshift(candidate)');
    expect(promptBuilder).toContain(
      'droppedHistoryMessages: input.history.length - selected.length',
    );
    expect(generationRoutes).toContain('return Math.min(32_000, contextWindow - outputTokens)');
    expect(generationRoutes).toContain('promptsByModel');
    expect(generationRoutes).toContain('calculateInputContextBudget(candidate.contextWindow');
    expect(promptSpecification).toContain('bounded recent active-branch messages');
    expect(promptSpecification).toContain(
      'Lower-priority history is trimmed before invariant policy or character identity.',
    );
  });

  it('keeps section 30 response output presets server-owned and bounded', async () => {
    const [serverConfig, domain, settingsUi, migration] = await Promise.all([
      readFile(new URL('../../apps/api/src/response-lengths.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../packages/domain/src/index.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/src/ChatsView.tsx', import.meta.url), 'utf8'),
      readFile(
        new URL('../../migrations/0037_detailed_response_length.sql', import.meta.url),
        'utf8',
      ),
    ]);

    for (const [preset, maximum] of [
      ['SHORT', '400'],
      ['MEDIUM', '800'],
      ['DETAILED', '1_600'],
      ['LONG', '8_192'],
    ] as const) {
      expect(serverConfig).toMatch(
        new RegExp(`${preset}:\\s*\\{[\\s\\S]*?maxOutputTokens:\\s*${maximum}[,\\s]`, 'u'),
      );
    }
    expect(serverConfig).toContain('promptInstruction');
    expect(serverConfig).toContain('readResponseLengthPromptInstruction');
    expect(domain).toContain("z.enum(['SHORT', 'MEDIUM', 'DETAILED', 'LONG'])");
    for (const preset of ['SHORT', 'MEDIUM', 'DETAILED', 'LONG']) {
      expect(settingsUi).toContain(`<option value="${preset}">`);
    }
    expect(settingsUi).not.toMatch(/maxOutputTokens:\s*(?:400|800|1_600|8_192)/u);
    expect(migration).toContain("('SHORT', 'MEDIUM', 'DETAILED', 'LONG')");
  });

  it('streams section 31 incrementally but persists one final assistant message', async () => {
    const [generationRoutes, sseClient, chatView] = await Promise.all([
      readFile(new URL('../../apps/api/src/generation-routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/src/api.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/src/ChatsView.tsx', import.meta.url), 'utf8'),
    ]);
    const deltaStart = generationRoutes.indexOf("if (event.type === 'delta')");
    const deltaEnd = generationRoutes.indexOf('continue;', deltaStart);
    const deltaBranch = generationRoutes.slice(deltaStart, deltaEnd);

    expect(deltaStart).toBeGreaterThan(-1);
    expect(deltaEnd).toBeGreaterThan(deltaStart);
    expect(deltaBranch).toContain("sse(encoder, 'delta'");
    expect(deltaBranch).not.toMatch(/\.prepare\(|\.batch\(|UPDATE\s+messages|INSERT\s+INTO/iu);
    expect(generationRoutes).toContain("UPDATE messages SET content = ?, status = 'COMPLETED'");
    expect(generationRoutes).toContain("sse(encoder, 'done'");
    expect(sseClient).toContain('response.body.getReader()');
    expect(sseClient).toContain('onEvent({ event, data: parsed })');
    expect(chatView).toContain('await apiSse(');
    expect(chatView).toContain("eventName === 'delta'");
    expect(chatView).toContain(
      "client.invalidateQueries({ queryKey: ['messages', conversationId] })",
    );
  });

  it('makes section 32 message and paid-generation retries idempotent at D1 boundaries', async () => {
    const [schema, mutationMigration, generationRoutes, conversationRoutes] = await Promise.all([
      readFile(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'),
      readFile(
        new URL('../../migrations/0003_conversation_idempotency.sql', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../../apps/api/src/generation-routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/api/src/conversation-routes.ts', import.meta.url), 'utf8'),
    ]);

    expect(schema).toContain('UNIQUE(conversation_id, idempotency_key)');
    expect(schema).toContain('CREATE TABLE generation_locks');
    expect(mutationMigration).toContain('PRIMARY KEY(user_id, operation, idempotency_key)');
    expect(conversationRoutes).toContain('insertMessageIdempotently');
    expect(conversationRoutes).toContain("'CREATE_MESSAGE'");
    expect(generationRoutes).toContain('findGenerationByKey');
    expect(generationRoutes).toContain("status = 'REFUNDED'");
    expect(generationRoutes).toContain("throw new AppError('GENERATION_IN_PROGRESS'");
    expect(generationRoutes).toContain('PER_USER_DAILY_AI_BUDGET_USD');
    expect(generationRoutes).toContain('WHERE conversation_id = ? OR user_id = ?');
  });

  it('implements sections 33 and 34 as provenance-rich greeting messages', async () => {
    const [migration, conversationRoutes, generationRoutes, domain] = await Promise.all([
      readFile(new URL('../../migrations/0038_message_provenance.sql', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/api/src/conversation-routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/api/src/generation-routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../packages/domain/src/index.ts', import.meta.url), 'utf8'),
    ]);

    for (const column of [
      'content_format',
      'is_greeting',
      'edited_by_user',
      'origin',
      'created_at',
      'updated_at',
      'deleted_at',
    ]) {
      expect(migration).toContain(column);
    }
    expect(domain).toContain("z.enum(['USER', 'ASSISTANT', 'INTERNAL'])");
    expect(domain).toContain("'DELETED'");
    expect(conversationRoutes).toContain("'CHARACTER_GREETING', ?, ?, ?)");
    expect(conversationRoutes).toContain('greetingIndex: index');
    expect(conversationRoutes).toContain('isGreeting: row.isGreeting === 1');
    expect(conversationRoutes).toContain("status = 'DELETED', deleted_at = ?, updated_at = ?");
    expect(generationRoutes).toContain("'AI_GENERATION'");
    expect(generationRoutes).toContain("status = 'COMPLETED'");
  });

  it('implements section 35 as conversation-scoped greeting edit and regeneration', async () => {
    const [domain, conversationRoutes, generationRoutes, chatsView, localization] =
      await Promise.all([
        readFile(new URL('../../packages/domain/src/index.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/conversation-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/generation-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/ChatsView.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/i18n.tsx', import.meta.url), 'utf8'),
      ]);

    expect(domain).toContain("'GREETING'");
    expect(conversationRoutes).toContain('isGreeting: original.isGreeting === 1');
    expect(conversationRoutes).toContain(
      'metadataJson: JSON.stringify({ editedFromId: original.id })',
    );
    expect(generationRoutes).toContain("input.mode === 'GREETING'");
    expect(generationRoutes).toContain("responseParentMessageId: input.mode === 'GREETING' ? null");
    expect(generationRoutes).toContain("isGreeting: input.mode === 'GREETING'");
    expect(chatsView).toContain("runMessageGeneration(message.id, 'GREETING')");
    expect(chatsView).toContain('translations.chat.regenerateGreeting');
    expect(localization).toContain("regenerateGreeting: 'Перегенерировать приветствие'");
  });

  it('implements sections 36 to 38 as viewport-safe role-specific message menus', async () => {
    const [components, chat, styles, e2e] = await Promise.all([
      readFile(new URL('../../apps/web/src/ChatComponents.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/src/ChatsView.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8'),
      readFile(new URL('../../tests/e2e/foundation.spec.ts', import.meta.url), 'utf8'),
    ]);

    expect(components).toContain('calculateMessageMenuPlacement');
    expect(components).toContain("mode: 'bottom-sheet'");
    expect(components).toContain("mode: below ? 'anchored-below' : 'anchored-above'");
    expect(components).toContain("document.addEventListener('scroll', update, true)");
    expect(styles).toContain('position: fixed');
    expect(styles).toContain(".message-actions[data-placement='bottom-sheet']");
    for (const action of [
      'translations.chat.copy',
      'translations.chat.edit',
      'translations.chat.branchHere',
      'translations.chat.regenerate',
      'translations.chat.continueAnswer',
      'translations.chat.rateResponse',
      'translations.chat.report',
      'translations.chat.delete',
    ]) {
      expect(chat).toContain(action);
    }
    expect(e2e).toContain("getByRole('menuitem')).toHaveCount(4)");
    expect(e2e).toContain('assistantMenuBounds.x + assistantMenuBounds.width');
    expect(e2e).toContain('assistantMenuBounds.y + assistantMenuBounds.height');
  });

  it('implements sections 39 to 42 with immutable edits, variants, and continuation', async () => {
    const [domain, conversationRoutes, generationRoutes, chat, localization, workerIntegration] =
      await Promise.all([
        readFile(new URL('../../packages/domain/src/index.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/conversation-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/generation-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/ChatsView.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/i18n.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../../toolkit/test-api.mjs', import.meta.url), 'utf8'),
      ]);

    expect(conversationRoutes).toContain('parentMessageId: original.parentMessageId');
    expect(conversationRoutes).toContain('role: original.role');
    expect(conversationRoutes).toContain("input.operation === 'EDIT_MESSAGE' ? 'USER_EDIT'");
    expect(conversationRoutes).toContain(
      'metadataJson: JSON.stringify({ editedFromId: original.id })',
    );
    expect(chat).toContain('hasConversationDescendants(messages.data?.items ?? [], message.id)');
    expect(localization).toContain(
      "editCreatesBranch: 'Изменение этого сообщения создаст новую ветку разговора.'",
    );
    expect(domain).toContain("z.enum(['REPLY', 'CONTINUE', 'GREETING'])");
    expect(generationRoutes).toContain('generation_group_id AS generationGroupId');
    expect(generationRoutes).toContain("input.mode !== 'CONTINUE' && existingGroup");
    expect(generationRoutes).toContain("continuation: input.mode === 'CONTINUE'");
    expect(generationRoutes).toContain(
      "responseParentMessageId: input.mode === 'GREETING' ? null : parent.id",
    );
    expect(workerIntegration).toContain('Assistant editing unexpectedly called the LLM provider.');
    expect(workerIntegration).toContain(
      'The assistant override was not selected for subsequent AI context.',
    );
    expect(workerIntegration).toContain(
      'Regenerated responses were not exposed as immutable sibling variants.',
    );
    expect(workerIntegration).toContain(
      'Continue did not add its internal, non-visible generation instruction.',
    );
  });

  it('implements sections 43 to 49 with an immutable graph and one safe Markdown pipeline', async () => {
    const [leafMigration, conversationRoutes, generationRoutes, chat, app, markdown, styles, e2e] =
      await Promise.all([
        readFile(new URL('../../migrations/0039_active_leaf_message.sql', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/conversation-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/api/src/generation-routes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/ChatsView.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/AuthenticatedApp.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/SafeMarkdown.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8'),
        readFile(new URL('../../tests/e2e/foundation.spec.ts', import.meta.url), 'utf8'),
      ]);

    expect(leafMigration).toContain('active_message_id TO active_leaf_message_id');
    expect(conversationRoutes).toContain('active_leaf_message_id AS activeMessageId');
    expect(conversationRoutes).toContain("status = 'DELETED', deleted_at = ?, updated_at = ?");
    expect(conversationRoutes).toContain('WITH RECURSIVE descendants(id) AS');
    expect(generationRoutes).toContain(
      'WITH RECURSIVE branch(id, parentId, role, content, status, depth)',
    );
    expect(chat).toContain(
      "client.invalidateQueries({ queryKey: ['conversation-memory', conversationId] })",
    );
    expect(chat).toContain('<SafeMarkdown content={editDraft} />');
    expect(app).toContain('<SafeMarkdown content={character.description} />');
    expect(app).toContain('renderTemplate(previewGreeting');
    expect(markdown).toContain('remarkPlugins={[[remarkGfm, { singleTilde: false }]]}');
    expect(markdown).toContain('rehypePlugins={[rehypeSanitize]}');
    expect(markdown).toContain('urlTransform={safeMarkdownUrlTransform}');
    expect(markdown).toContain('stabilizeStreamingMarkdown(content)');
    expect(styles).toContain('color: var(--rp-action)');
    expect(styles).toContain('overflow-anchor: none');
    expect(e2e).toContain("locator('.character-markdown-description strong')");
    expect(e2e).toContain(
      "getByRole('region', { name: 'Предпросмотр приветствия' }).locator('em')",
    );
  });

  it('runs browser visual review against a production-like build and preview', async () => {
    const playwright = await readFile(
      new URL('../../playwright.config.ts', import.meta.url),
      'utf8',
    );
    const webServerCommand = /command:\s*[\r\n\s]*'([^']+)'/u.exec(playwright)?.[1] ?? '';

    expect(webServerCommand).toContain('pnpm --filter @velora/web build');
    expect(webServerCommand).toContain('pnpm --filter @velora/web preview');
    expect(webServerCommand.indexOf(' build')).toBeLessThan(webServerCommand.indexOf(' preview'));
    expect(webServerCommand).not.toContain(' dev');
    expect(playwright).toContain("name: 'android'");
    expect(playwright).toContain("name: 'iphone'");
    expect(playwright).toContain("name: 'desktop'");
  });
});
