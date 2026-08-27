// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionMenu,
  calculateActionMenuPlacement,
  Dropdown,
  FilterSheet,
  LocaleButton,
  MemoryEditor,
  MemoryVersionList,
  PersonaCard,
  PlanCard,
  PlanCarousel,
  SortMenu,
  type DiscoveryFilters,
} from './ProductComponents';

afterEach(cleanup);

describe('MemoryVersionList', () => {
  it('marks the active version and restores a selected historical version', () => {
    const restore = vi.fn();
    render(
      <MemoryVersionList
        versions={[
          {
            id: 'memory-current',
            content: 'Current memory',
            manualContext: 'Current memory',
            autoSummary: '',
            sourceType: 'MANUAL_EDIT',
            fromMessageId: null,
            toMessageId: null,
            createdAt: 2,
            provider: null,
            model: null,
            previousVersionId: 'memory-old',
          },
          {
            id: 'memory-old',
            content: 'Previous memory',
            manualContext: '',
            autoSummary: 'Previous memory',
            sourceType: 'AUTO_SUMMARY',
            fromMessageId: null,
            toMessageId: 'message-1',
            createdAt: 1,
            provider: 'VELORA',
            model: 'deterministic-extractive-v1',
            previousVersionId: null,
          },
        ]}
        activeId="memory-current"
        pending={false}
        labels={{
          title: 'Memory versions',
          empty: 'No versions',
          active: 'Active',
          restore: 'Restore',
          describe: (version) => version.sourceType,
        }}
        onRestore={restore}
      />,
    );

    expect(screen.getByText('Active')).not.toBeNull();
    expect(
      screen.getByText('Current memory').closest('article')?.classList.contains('is-active'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(restore).toHaveBeenCalledExactlyOnceWith('memory-old');
  });
});

describe('LocaleButton', () => {
  it('shows the active locale and requests the opposite locale', () => {
    const change = vi.fn();
    const { rerender } = render(
      <LocaleButton
        locale="ru"
        pending={false}
        label="Переключить язык интерфейса"
        onChange={change}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Переключить язык интерфейса' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('en');
    rerender(
      <LocaleButton locale="en" pending label="Switch interface language" onChange={change} />,
    );
    const button = screen.getByRole('button', { name: 'Switch interface language' });
    expect(button.textContent).toBe('EN');
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});

describe('ActionMenu', () => {
  it('opens owner actions, invokes the selected action, and closes', () => {
    const edit = vi.fn();
    render(
      <ActionMenu
        label="Действия с персонажем"
        items={[{ label: 'Редактировать', onSelect: edit }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Действия с персонажем' });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.querySelector(':scope > .action-menu-popover')).not.toBeNull();
    expect(document.querySelector('.action-menu .action-menu-popover')).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Редактировать' }));
    expect(edit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps a portalled card menu inside narrow viewports and flips it above the trigger', () => {
    expect(
      calculateActionMenuPlacement({
        anchor: { top: 540, right: 315, bottom: 574 },
        menu: { width: 180, height: 160 },
        viewport: { width: 320, height: 568 },
      }),
    ).toEqual({ left: 132, top: 374 });
  });

  it('closes on Escape without invoking an action', () => {
    const edit = vi.fn();
    render(<ActionMenu label="Действия с книгой" items={[{ label: 'Открыть', onSelect: edit }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Действия с книгой' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(edit).not.toHaveBeenCalled();
  });
});

describe('SortMenu', () => {
  it('announces the selected option and closes after selection', () => {
    const change = vi.fn();
    render(
      <SortMenu
        value="newest"
        onChange={change}
        options={[
          { value: 'newest', label: 'Сначала новые' },
          { value: 'oldest', label: 'Сначала старые' },
          { value: 'active', label: 'Наиболее активные' },
        ]}
        label="Сортировка"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Сортировка' });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByRole('option', { name: /Сначала новые/u }).getAttribute('aria-selected'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('option', { name: 'Наиболее активные' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('active');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape and outside click without changing the sort', () => {
    const change = vi.fn();
    render(
      <div>
        <SortMenu
          value="newest"
          onChange={change}
          options={[
            { value: 'newest', label: 'Сначала новые' },
            { value: 'oldest', label: 'Сначала старые' },
            { value: 'active', label: 'Наиболее активные' },
          ]}
          label="Сортировка"
        />
        <button type="button">Снаружи</button>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Сортировка' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Снаружи' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it('moves through options with arrow, Home, and End keys', () => {
    render(
      <SortMenu
        value="newest"
        onChange={vi.fn()}
        options={[
          { value: 'newest', label: 'Сначала новые' },
          { value: 'oldest', label: 'Сначала старые' },
          { value: 'active', label: 'Наиболее активные' },
        ]}
        label="Сортировка"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Сортировка' }));
    expect(document.activeElement).toBe(screen.getByRole('option', { name: /Сначала новые/u }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Наиболее активные' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Сначала старые' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('option', { name: /Сначала новые/u }));
  });
});

const filterLabels = {
  language: 'Язык',
  languagePlaceholder: 'Найти язык',
  languageResults: (count: number) => `Языков: ${String(count)}`,
  languageSelection: (count: number) => `Выбрано: ${String(count)}`,
  selectLanguage: (name: string) => `Выбрать язык «${name}»`,
  loadingLanguages: 'Загружаем языки…',
  noLanguages: 'Языков нет',
  groupSize: 'Размер группы',
  groupSizeSelection: (count: number) => `Выбрано групп: ${String(count)}`,
  groupSizeLabels: {
    single: 'Один персонаж (1)',
    small: 'Малая группа (2–4)',
    medium: 'Средняя группа (5–7)',
    large: 'Большая группа (8+)',
  },
  selectGroupSize: (name: string) => `Выбрать размер «${name}»`,
  loadingGroupSizes: 'Загружаем размеры…',
  noGroupSizes: 'Размеров нет',
  tagsFacet: (count: number) => `Теги · ${String(count)}`,
  languagesFacet: (count: number) => `Языки · ${String(count)}`,
  rating: 'Категория',
  allRatings: 'Все доступные',
  safe: 'Только Safe',
  mature: 'Только Mature',
  tags: 'Теги',
  tagsPlaceholder: 'Найти тег',
  tagResults: (count: number) => `Тегов: ${String(count)}`,
  tagSelection: (include: number, exclude: number) =>
    `Включено: ${String(include)} · Исключено: ${String(exclude)}`,
  includeTag: (name: string) => `Включить тег «${name}»`,
  excludeTag: (name: string) => `Исключить тег «${name}»`,
  includedTag: 'включён',
  excludedTag: 'исключён',
  loadingTags: 'Загружаем теги…',
  noTags: 'Тегов нет',
  apply: 'Применить',
  reset: 'Сбросить',
  close: 'Закрыть фильтры',
} as const;

describe('FilterSheet', () => {
  it('keeps controlled filters synchronized and routes apply and reset actions', () => {
    const apply = vi.fn();
    const reset = vi.fn();
    function Harness() {
      const [filters, setFilters] = useState<DiscoveryFilters>({
        languages: [],
        groupSizes: [],
        rating: 'ALL',
        includeTags: [],
        excludeTags: [],
      });
      return (
        <FilterSheet
          title="Фильтры поиска"
          filters={filters}
          tagOptions={[
            { slug: 'mystery', displayName: 'Мистика', usageCount: 12 },
            { slug: 'romance', displayName: 'Романтика', usageCount: 8 },
          ]}
          tagOptionsLoading={false}
          languageOptions={[
            { code: 'ru', nativeName: 'Русский', direction: 'ltr', usageCount: 12 },
            { code: 'en', nativeName: 'English', direction: 'ltr', usageCount: 9 },
            { code: 'zh', nativeName: '中文', direction: 'ltr', usageCount: 4 },
            { code: 'ar', nativeName: 'العربية', direction: 'rtl', usageCount: 3 },
          ]}
          languageOptionsLoading={false}
          groupSizeOptions={[
            { code: 'single', minimumParticipants: 1, maximumParticipants: 1, usageCount: 12 },
            { code: 'small', minimumParticipants: 2, maximumParticipants: 4, usageCount: 5 },
            { code: 'medium', minimumParticipants: 5, maximumParticipants: 7, usageCount: 2 },
            { code: 'large', minimumParticipants: 8, maximumParticipants: null, usageCount: 1 },
          ]}
          groupSizeOptionsLoading={false}
          showGroupSizes={true}
          labels={filterLabels}
          onChange={setFilters}
          onApply={apply}
          onReset={reset}
          onClose={vi.fn()}
        />
      );
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), {
      target: { value: 'SAFE' },
    });
    const includeMystery = screen.getByRole('checkbox', { name: 'Включить тег «Мистика»' });
    const excludeMystery = screen.getByRole('button', { name: 'Исключить тег «Мистика»' });
    fireEvent.click(includeMystery);
    expect(includeMystery.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(excludeMystery);
    expect(includeMystery.getAttribute('aria-checked')).toBe('false');
    expect(excludeMystery.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(excludeMystery);
    fireEvent.click(includeMystery);
    fireEvent.click(screen.getByRole('button', { name: 'Исключить тег «Романтика»' }));
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Категория' }).value).toBe(
      'SAFE',
    );
    expect(screen.getByText('Включено: 1 · Исключено: 1').textContent).toBe(
      'Включено: 1 · Исключено: 1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Языки · 0' }));
    const smallGroup = screen.getByRole('checkbox', {
      name: 'Выбрать размер «Малая группа (2–4)»',
    });
    fireEvent.click(smallGroup);
    expect(smallGroup.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Выбрано групп: 1').textContent).toBe('Выбрано групп: 1');
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(apply).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('supports searchable Unicode languages and independent CJK/RTL selection', () => {
    function Harness() {
      const [filters, setFilters] = useState<DiscoveryFilters>({
        languages: [],
        groupSizes: [],
        rating: 'ALL',
        includeTags: [],
        excludeTags: [],
      });
      return (
        <FilterSheet
          title="Фильтры поиска"
          filters={filters}
          tagOptions={[]}
          tagOptionsLoading={false}
          languageOptions={[
            { code: 'ru', nativeName: 'Русский', direction: 'ltr', usageCount: 12 },
            { code: 'zh', nativeName: '中文', direction: 'ltr', usageCount: 4 },
            { code: 'ja', nativeName: '日本語', direction: 'ltr', usageCount: 3 },
            { code: 'ko', nativeName: '한국어', direction: 'ltr', usageCount: 2 },
            { code: 'ar', nativeName: 'العربية', direction: 'rtl', usageCount: 1 },
          ]}
          languageOptionsLoading={false}
          groupSizeOptions={[]}
          groupSizeOptionsLoading={false}
          showGroupSizes={true}
          labels={filterLabels}
          onChange={setFilters}
          onApply={vi.fn()}
          onReset={vi.fn()}
          onClose={vi.fn()}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Языки · 0' }));
    for (const language of ['Русский', '中文', '日本語', '한국어', 'العربية']) {
      expect(screen.getByText(language).textContent).toBe(language);
    }
    const arabic = screen.getByRole('checkbox', { name: 'Выбрать язык «العربية»' });
    fireEvent.click(arabic);
    expect(arabic.getAttribute('aria-checked')).toBe('true');
    const arabicLabel = screen.getByText('العربية');
    expect(arabicLabel.getAttribute('dir')).toBe('rtl');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Язык' }), {
      target: { value: '中文' },
    });
    expect(screen.getByText('中文').textContent).toBe('中文');
    expect(screen.queryByText('日本語')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Выбрать язык «中文»' }));
    expect(screen.getByText('Выбрано: 2').textContent).toBe('Выбрано: 2');
  });

  it('closes from the explicit control and backdrop but not from the sheet itself', () => {
    const close = vi.fn();
    const { container } = render(
      <FilterSheet
        title="Фильтры поиска"
        filters={{ languages: [], groupSizes: [], rating: 'ALL', includeTags: [], excludeTags: [] }}
        tagOptions={[]}
        tagOptionsLoading={false}
        languageOptions={[]}
        languageOptionsLoading={false}
        groupSizeOptions={[]}
        groupSizeOptionsLoading={false}
        showGroupSizes={false}
        labels={filterLabels}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
        onClose={close}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByText('Размер группы')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть фильтры' }));
    expect(close).toHaveBeenCalledOnce();
    const backdrop = container.querySelector('.chat-dialog-backdrop');
    expect(backdrop).not.toBeNull();
    if (backdrop === null) {
      throw new Error('Filter backdrop was not rendered');
    }
    fireEvent.mouseDown(backdrop);
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe('MemoryEditor', () => {
  it('exposes memory state and routes every editing action', () => {
    const change = vi.fn();
    const save = vi.fn();
    const summarize = vi.fn();
    const regenerate = vi.fn();
    const keep = vi.fn();
    render(
      <MemoryEditor
        title="Память"
        description="Долгосрочный контекст"
        tokenLabel="120 токенов"
        sourceLabel="Ручная"
        staleMessage="Память устарела"
        manualInputLabel="Содержимое памяти"
        manualValue="Старый факт"
        pending={false}
        pendingMessage={null}
        errorMessage={null}
        labels={{
          save: 'Сохранить',
          summarize: 'Суммаризировать',
          regenerate: 'Пересобрать',
          keep: 'Оставить',
        }}
        onChange={change}
        onSave={save}
        onSummarize={summarize}
        onRegenerate={regenerate}
        onKeep={keep}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Содержимое памяти' }), {
      target: { value: 'Новый факт' },
    });
    for (const name of ['Сохранить', 'Суммаризировать', 'Пересобрать', 'Оставить']) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(change).toHaveBeenCalledExactlyOnceWith('Новый факт');
    expect(save).toHaveBeenCalledOnce();
    expect(summarize).toHaveBeenCalledOnce();
    expect(regenerate).toHaveBeenCalledOnce();
    expect(keep).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toContain('Память устарела');
  });

  it('locks mutations while a memory job is running and announces errors', () => {
    render(
      <MemoryEditor
        title="Memory"
        description="Context"
        tokenLabel="0 tokens"
        sourceLabel="Empty"
        staleMessage={null}
        manualInputLabel="Memory content"
        manualValue=""
        pending
        pendingMessage="Processing"
        errorMessage="Request failed"
        labels={{ save: 'Save', summarize: 'Summarize', regenerate: 'Regenerate', keep: 'Keep' }}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onSummarize={vi.fn()}
        onRegenerate={vi.fn()}
        onKeep={vi.fn()}
      />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button.hasAttribute('disabled')).toBe(true);
    }
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Request failed');
  });

  it('keeps a large manual memory editable without truncating its content', () => {
    const largeMemory = Array.from(
      { length: 400 },
      (_, index) => `Факт ${String(index + 1)} остаётся частью истории.`,
    ).join('\n');
    render(
      <MemoryEditor
        title="Память"
        description="Контекст"
        tokenLabel="4000 токенов"
        sourceLabel="Ручная"
        staleMessage={null}
        manualInputLabel="Содержимое памяти"
        manualValue={largeMemory}
        pending={false}
        pendingMessage={null}
        errorMessage={null}
        labels={{
          save: 'Сохранить',
          summarize: 'Суммаризировать',
          regenerate: 'Пересобрать',
          keep: 'Оставить',
        }}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onSummarize={vi.fn()}
        onRegenerate={vi.fn()}
        onKeep={vi.fn()}
      />,
    );
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Содержимое памяти' }).value,
    ).toBe(largeMemory);
  });
});

describe('Dropdown', () => {
  it('has an accessible label and emits the selected value', () => {
    const onChange = vi.fn();
    render(
      <Dropdown
        label="Видимость"
        name="visibility"
        defaultValue="PRIVATE"
        options={[
          ['PRIVATE', 'Только мне'],
          ['PUBLIC', 'Публичный'],
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Видимость' }), {
      target: { value: 'PUBLIC' },
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('PUBLIC');
  });
});

describe('PersonaCard', () => {
  it('shows badges and routes edit, default and remove actions', () => {
    const edit = vi.fn();
    const makeDefault = vi.fn();
    const remove = vi.fn();
    render(
      <PersonaCard
        actionsLabel="Persona actions"
        avatar={<span aria-hidden="true">А</span>}
        name="Алиса"
        description="Путешественница"
        badges={['Публичный']}
        editLabel="Изменить"
        defaultLabel="Сделать основной"
        removeLabel="Удалить"
        isDefault={false}
        onEdit={edit}
        onMakeDefault={makeDefault}
        onRemove={remove}
      />,
    );
    for (const name of ['Изменить', 'Сделать основной', 'Удалить']) {
      fireEvent.click(screen.getByRole('button', { name: 'Persona actions' }));
      fireEvent.click(screen.getByRole('menuitem', { name }));
    }
    expect(edit).toHaveBeenCalledOnce();
    expect(makeDefault).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.getByText('Публичный')).toBeTruthy();
  });

  it('does not offer making an already-default persona default again', () => {
    render(
      <PersonaCard
        actionsLabel="Persona actions"
        avatar={null}
        name="Основная"
        description="Описание"
        badges={['Основная']}
        editLabel="Изменить"
        defaultLabel="Сделать основной"
        removeLabel="Удалить"
        isDefault
        onEdit={vi.fn()}
        onMakeDefault={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Сделать основной' })).toBeNull();
  });
});

describe('PlanCard', () => {
  it('renders one-time plan details and invokes a permitted purchase', () => {
    const purchase = vi.fn();
    render(
      <PlanCard
        stars={120}
        title="Plus 30"
        description="Расширенные возможности"
        detail="30 дней · PLUS"
        benefits={['До 50 персонажей', 'Расширенная память']}
        priceLabel="120 Stars"
        current={false}
        premium
        actionLabel="Купить один раз"
        disabled={false}
        onPurchase={purchase}
      />,
    );
    expect(screen.getByText('До 50 персонажей')).toBeTruthy();
    expect(screen.getByText('120 Stars')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Купить один раз' }));
    expect(purchase).toHaveBeenCalledOnce();
  });

  it('blocks purchase while its prerequisites are incomplete', () => {
    const purchase = vi.fn();
    render(
      <PlanCard
        stars={120}
        title="Plus 30"
        description="Описание"
        detail="30 дней · PLUS"
        benefits={['До 50 персонажей']}
        priceLabel="120 Stars"
        current={false}
        premium={false}
        actionLabel="Купить один раз"
        disabled
        onPurchase={purchase}
      />,
    );
    const button = screen.getByRole('button', { name: 'Купить один раз' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(purchase).not.toHaveBeenCalled();
  });

  it('renders the free plan as included without a purchase control', () => {
    render(
      <PlanCard
        stars={null}
        title="Free"
        description="Базовые возможности"
        detail="Без срока"
        benefits={['До 10 персонажей']}
        badge="Текущий"
        priceLabel="Бесплатно"
        current
        premium={false}
        actionLabel="Доступен всем"
        disabled
      />,
    );
    expect(screen.getByText('Текущий')).toBeTruthy();
    expect(screen.getByText('Бесплатно')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Доступен всем');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PlanCarousel', () => {
  it('exposes bounded navigation and one position marker per plan', () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    render(
      <PlanCarousel label="Тарифы" previousLabel="Предыдущий тариф" nextLabel="Следующий тариф">
        <article className="plan-card">Free</article>
        <article className="plan-card">Premium</article>
        <article className="plan-card">Pro</article>
      </PlanCarousel>,
    );
    expect(screen.getByRole('region', { name: 'Тарифы' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Предыдущий тариф' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Следующий тариф' })).toBeTruthy();
    expect(document.querySelectorAll('.plan-carousel-dots > button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '2 / 3' }));
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '2 / 3' }).getAttribute('aria-current')).toBe('true');
    const track = document.querySelector<HTMLElement>('.plan-card-stack');
    if (!track) throw new Error('Plan carousel track is missing.');
    fireEvent.keyDown(track, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '3 / 3' }).getAttribute('aria-current')).toBe('true');
  });
});
