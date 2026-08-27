import type { CharacterGroupSize, CharacterLanguageCode } from '@velora/shared';
import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Popover, Sheet } from './CoreComponents';
import { VeloraIcon } from './VeloraIcon';
import type { MemoryVersion } from './types';

export function LocaleButton({
  locale,
  pending,
  label,
  onChange,
}: {
  readonly locale: 'ru' | 'en';
  readonly pending: boolean;
  readonly label: string;
  readonly onChange: (locale: 'ru' | 'en') => void;
}) {
  return (
    <button
      className="shell-icon-button locale-button"
      type="button"
      aria-label={label}
      disabled={pending}
      onClick={() => {
        onChange(locale === 'ru' ? 'en' : 'ru');
      }}
    >
      {locale.toUpperCase()}
    </button>
  );
}

export interface ActionMenuItem {
  readonly label: string;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

export function calculateActionMenuPlacement({
  anchor,
  menu,
  viewport,
  inset = 8,
  gap = 6,
}: {
  readonly anchor: { readonly top: number; readonly right: number; readonly bottom: number };
  readonly menu: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly inset?: number;
  readonly gap?: number;
}) {
  const left = Math.max(
    inset,
    Math.min(anchor.right - menu.width, viewport.width - menu.width - inset),
  );
  const below = anchor.bottom + gap;
  const top =
    below + menu.height <= viewport.height - inset
      ? below
      : Math.max(inset, anchor.top - gap - menu.height);
  return { left, top };
}

export function ActionMenu({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (
        event instanceof MouseEvent &&
        (root.current?.contains(event.target as Node) ||
          menu.current?.contains(event.target as Node))
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchorRect = trigger.current?.getBoundingClientRect();
      const menuRect = menu.current?.getBoundingClientRect();
      if (!anchorRect || !menuRect) return;
      setPosition(
        calculateActionMenuPlacement({
          anchor: anchorRect,
          menu: menuRect,
          viewport: {
            width: document.documentElement.clientWidth,
            height: window.visualViewport?.height ?? window.innerHeight,
          },
        }),
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [open]);
  return (
    <div className="action-menu" ref={root}>
      <button
        ref={trigger}
        className="action-menu-trigger"
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <VeloraIcon name="more" />
      </button>
      {open
        ? createPortal(
            <Popover
              elementRef={menu}
              className="action-menu-popover action-menu-portal"
              role="menu"
              label={label}
              style={{ left: position.left, top: position.top }}
            >
              {items.map((item) => (
                <button
                  className={item.danger ? 'danger-link' : ''}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  key={item.label}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </Popover>,
            document.body,
          )
        : null}
    </div>
  );
}

export interface DiscoveryFilters {
  readonly languages: readonly CharacterLanguageCode[];
  readonly groupSizes: readonly CharacterGroupSize[];
  readonly rating: 'ALL' | 'SAFE' | 'MATURE';
  readonly includeTags: readonly string[];
  readonly excludeTags: readonly string[];
}

export interface DiscoveryTagOption {
  readonly slug: string;
  readonly displayName: string;
  readonly usageCount: number;
}

export interface DiscoveryLanguageOption {
  readonly code: CharacterLanguageCode;
  readonly nativeName: string;
  readonly direction: 'ltr' | 'rtl';
  readonly usageCount: number;
}

export interface DiscoveryGroupSizeOption {
  readonly code: CharacterGroupSize;
  readonly minimumParticipants: number;
  readonly maximumParticipants: number | null;
  readonly usageCount: number;
}

export function SortDropdown<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
  }[];
  readonly label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof MouseEvent && root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    optionRefs.current[selectedIndex]?.focus();
  }, [open, options, value]);
  return (
    <div className="sort-menu" ref={root}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {options.find((option) => option.value === value)?.label ?? value}{' '}
        <VeloraIcon name="chevronDown" />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={(event) => {
            const focusedIndex = optionRefs.current.findIndex(
              (option) => option === document.activeElement,
            );
            const lastIndex = options.length - 1;
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? lastIndex
                  : event.key === 'ArrowDown'
                    ? Math.min(lastIndex, focusedIndex + 1)
                    : event.key === 'ArrowUp'
                      ? Math.max(0, focusedIndex - 1)
                      : null;
            if (nextIndex === null) return;
            event.preventDefault();
            optionRefs.current[nextIndex]?.focus();
          }}
        >
          {options.map((option, index) => (
            <button
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              className={value === option.value ? 'is-selected' : ''}
              type="button"
              role="option"
              aria-selected={value === option.value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {value === option.value ? <VeloraIcon name="check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const SortMenu = SortDropdown;

export function MemoryEditor({
  title,
  description,
  tokenLabel,
  sourceLabel,
  staleMessage,
  manualInputLabel,
  manualValue,
  pending,
  pendingMessage,
  errorMessage,
  labels,
  onChange,
  onSave,
  onSummarize,
  onRegenerate,
  onKeep,
}: {
  readonly title: string;
  readonly description: string;
  readonly tokenLabel: string;
  readonly sourceLabel: string;
  readonly staleMessage: string | null;
  readonly manualInputLabel: string;
  readonly manualValue: string;
  readonly pending: boolean;
  readonly pendingMessage: string | null;
  readonly errorMessage: string | null;
  readonly labels: {
    readonly save: string;
    readonly summarize: string;
    readonly regenerate: string;
    readonly keep: string;
  };
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onSummarize: () => void;
  readonly onRegenerate: () => void;
  readonly onKeep: () => void;
}) {
  return (
    <aside className="chat-lore-panel memory-panel">
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <div className="active-lore-summary">
        <span>{tokenLabel}</span>
        <span>{sourceLabel}</span>
      </div>
      {staleMessage ? (
        <p className="memory-warning" role="status">
          {staleMessage}
        </p>
      ) : null}
      <textarea
        aria-label={manualInputLabel}
        rows={7}
        maxLength={64_000}
        value={manualValue}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
      <div className="memory-actions">
        <button type="button" className="primary" disabled={pending} onClick={onSave}>
          {labels.save}
        </button>
        <button type="button" className="secondary" disabled={pending} onClick={onSummarize}>
          {labels.summarize}
        </button>
        <button type="button" className="secondary" disabled={pending} onClick={onRegenerate}>
          {labels.regenerate}
        </button>
        {staleMessage ? (
          <button type="button" className="secondary" disabled={pending} onClick={onKeep}>
            {labels.keep}
          </button>
        ) : null}
      </div>
      {pendingMessage ? <small role="status">{pendingMessage}</small> : null}
      {errorMessage ? (
        <span className="error" role="alert">
          {errorMessage}
        </span>
      ) : null}
    </aside>
  );
}

export function MemoryVersionList({
  versions,
  activeId,
  pending,
  labels,
  onRestore,
}: {
  readonly versions: readonly MemoryVersion[];
  readonly activeId: string | null;
  readonly pending: boolean;
  readonly labels: {
    readonly title: string;
    readonly empty: string;
    readonly active: string;
    readonly restore: string;
    readonly describe: (version: MemoryVersion) => string;
  };
  readonly onRestore: (id: string) => void;
}) {
  return (
    <section className="memory-version-list" aria-labelledby="memory-version-list-title">
      <strong id="memory-version-list-title">{labels.title}</strong>
      {versions.length === 0 ? <small>{labels.empty}</small> : null}
      <div>
        {versions.map((version) => {
          const active = version.id === activeId;
          return (
            <article className={active ? 'is-active' : undefined} key={version.id}>
              <span>
                <strong>{labels.describe(version)}</strong>
                <small>{version.content}</small>
              </span>
              {active ? (
                <span className="status-pill status-success">{labels.active}</span>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  disabled={pending}
                  onClick={() => {
                    onRestore(version.id);
                  }}
                >
                  {labels.restore}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function FilterSheet({
  title,
  filters,
  tagOptions,
  tagOptionsLoading,
  languageOptions,
  languageOptionsLoading,
  groupSizeOptions,
  groupSizeOptionsLoading,
  showGroupSizes,
  labels,
  onChange,
  onApply,
  onReset,
  onClose,
}: {
  readonly title: string;
  readonly filters: DiscoveryFilters;
  readonly tagOptions: readonly DiscoveryTagOption[];
  readonly tagOptionsLoading: boolean;
  readonly languageOptions: readonly DiscoveryLanguageOption[];
  readonly languageOptionsLoading: boolean;
  readonly groupSizeOptions: readonly DiscoveryGroupSizeOption[];
  readonly groupSizeOptionsLoading: boolean;
  readonly showGroupSizes: boolean;
  readonly labels: {
    readonly language: string;
    readonly languagePlaceholder: string;
    readonly languageResults: (count: number) => string;
    readonly languageSelection: (count: number) => string;
    readonly selectLanguage: (name: string) => string;
    readonly loadingLanguages: string;
    readonly noLanguages: string;
    readonly groupSize: string;
    readonly groupSizeSelection: (count: number) => string;
    readonly groupSizeLabels: Readonly<Record<CharacterGroupSize, string>>;
    readonly selectGroupSize: (name: string) => string;
    readonly loadingGroupSizes: string;
    readonly noGroupSizes: string;
    readonly tagsFacet: (count: number) => string;
    readonly languagesFacet: (count: number) => string;
    readonly rating: string;
    readonly allRatings: string;
    readonly safe: string;
    readonly mature: string;
    readonly tags: string;
    readonly tagsPlaceholder: string;
    readonly tagResults: (count: number) => string;
    readonly tagSelection: (include: number, exclude: number) => string;
    readonly includeTag: (name: string) => string;
    readonly excludeTag: (name: string) => string;
    readonly includedTag: string;
    readonly excludedTag: string;
    readonly loadingTags: string;
    readonly noTags: string;
    readonly apply: string;
    readonly reset: string;
    readonly close: string;
  };
  readonly onChange: (filters: DiscoveryFilters) => void;
  readonly onApply: () => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}) {
  const [activeFacet, setActiveFacet] = useState<'tags' | 'languages'>('tags');
  const [tagSearch, setTagSearch] = useState('');
  const [languageSearch, setLanguageSearch] = useState('');
  const tagOptionMap = new Map(tagOptions.map((option) => [option.slug, option]));
  for (const slug of [...filters.includeTags, ...filters.excludeTags]) {
    if (!tagOptionMap.has(slug)) {
      tagOptionMap.set(slug, { slug, displayName: slug, usageCount: 0 });
    }
  }
  const tagState = (slug: string): 'NEUTRAL' | 'INCLUDE' | 'EXCLUDE' => {
    if (filters.includeTags.includes(slug)) return 'INCLUDE';
    if (filters.excludeTags.includes(slug)) return 'EXCLUDE';
    return 'NEUTRAL';
  };
  const visibleTagOptions = [...tagOptionMap.values()]
    .filter((option) =>
      option.displayName.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase()),
    )
    .sort((left, right) => {
      const rank = (state: 'NEUTRAL' | 'INCLUDE' | 'EXCLUDE') =>
        state === 'EXCLUDE' ? 0 : state === 'INCLUDE' ? 1 : 2;
      const stateOrder = rank(tagState(left.slug)) - rank(tagState(right.slug));
      if (stateOrder !== 0) return stateOrder;
      if (right.usageCount !== left.usageCount) return right.usageCount - left.usageCount;
      return left.displayName.localeCompare(right.displayName);
    });
  const setTagState = (slug: string, next: 'NEUTRAL' | 'INCLUDE' | 'EXCLUDE') => {
    const includeTags = filters.includeTags.filter((candidate) => candidate !== slug);
    const excludeTags = filters.excludeTags.filter((candidate) => candidate !== slug);
    onChange({
      ...filters,
      includeTags: next === 'INCLUDE' ? [...includeTags, slug] : includeTags,
      excludeTags: next === 'EXCLUDE' ? [...excludeTags, slug] : excludeTags,
    });
  };
  const languageOptionMap = new Map(languageOptions.map((option) => [option.code, option]));
  for (const code of filters.languages) {
    if (!languageOptionMap.has(code)) {
      languageOptionMap.set(code, {
        code,
        nativeName: code,
        direction: code === 'ar' ? 'rtl' : 'ltr',
        usageCount: 0,
      });
    }
  }
  const visibleLanguageOptions = [...languageOptionMap.values()]
    .filter((option) =>
      option.nativeName.toLocaleLowerCase().includes(languageSearch.trim().toLocaleLowerCase()),
    )
    .sort((left, right) => {
      const selectedOrder =
        Number(filters.languages.includes(right.code)) -
        Number(filters.languages.includes(left.code));
      if (selectedOrder !== 0) return selectedOrder;
      if (right.usageCount !== left.usageCount) return right.usageCount - left.usageCount;
      return left.nativeName.localeCompare(right.nativeName);
    });
  const toggleLanguage = (code: CharacterLanguageCode) => {
    onChange({
      ...filters,
      languages: filters.languages.includes(code)
        ? filters.languages.filter((candidate) => candidate !== code)
        : [...filters.languages, code],
    });
  };
  const toggleGroupSize = (code: CharacterGroupSize) => {
    onChange({
      ...filters,
      groupSizes: filters.groupSizes.includes(code)
        ? filters.groupSizes.filter((candidate) => candidate !== code)
        : [...filters.groupSizes, code],
    });
  };
  return (
    <Sheet
      backdropClassName="chat-dialog-backdrop"
      className="chat-dialog filter-sheet"
      labelledBy="discovery-filter-title"
      onClose={onClose}
    >
      <header className="section-heading">
        <h2 id="discovery-filter-title">{title}</h2>
        <button type="button" aria-label={labels.close} onClick={onClose}>
          <VeloraIcon name="close" />
        </button>
      </header>
      {activeFacet === 'tags' ? (
        <section className="tag-filter-section" aria-labelledby="tag-filter-title">
          <div className="tag-filter-heading">
            <div>
              <h3 id="tag-filter-title">{labels.tags}</h3>
              <small>
                {labels.tagSelection(filters.includeTags.length, filters.excludeTags.length)}
              </small>
            </div>
          </div>
          <label className="tag-filter-search">
            <span className="sr-only">{labels.tags}</span>
            <VeloraIcon name="search" />
            <input
              type="search"
              value={tagSearch}
              placeholder={labels.tagsPlaceholder}
              aria-label={labels.tags}
              onChange={(event) => {
                setTagSearch(event.currentTarget.value);
              }}
            />
          </label>
          <small className="tag-filter-count" role="status">
            {labels.tagResults(visibleTagOptions.length)}
          </small>
          <div className="tag-filter-list" role="list" aria-label={labels.tags} tabIndex={0}>
            {tagOptionsLoading ? <p className="meta">{labels.loadingTags}</p> : null}
            {!tagOptionsLoading && visibleTagOptions.length === 0 ? (
              <p className="meta">{labels.noTags}</p>
            ) : null}
            {visibleTagOptions.map((option) => {
              const state = tagState(option.slug);
              return (
                <div
                  className={`tag-filter-row is-${state.toLocaleLowerCase()}`}
                  role="listitem"
                  key={option.slug}
                >
                  <button
                    className="tag-include-control"
                    type="button"
                    role="checkbox"
                    aria-checked={state === 'INCLUDE'}
                    aria-label={labels.includeTag(option.displayName)}
                    onClick={() => {
                      setTagState(option.slug, state === 'INCLUDE' ? 'NEUTRAL' : 'INCLUDE');
                    }}
                  >
                    <span aria-hidden="true">
                      {state === 'INCLUDE' ? <VeloraIcon name="check" size={16} /> : null}
                    </span>
                  </button>
                  <span className="tag-filter-copy">
                    <span className="tag-filter-name">{option.displayName}</span>
                    <span className="tag-filter-meta">
                      {state === 'INCLUDE' ? <small>{labels.includedTag}</small> : null}
                      {state === 'EXCLUDE' ? <small>{labels.excludedTag}</small> : null}
                      <span className="tag-filter-usage">{option.usageCount.toLocaleString()}</span>
                    </span>
                  </span>
                  <button
                    className="tag-exclude-control"
                    type="button"
                    aria-pressed={state === 'EXCLUDE'}
                    aria-label={labels.excludeTag(option.displayName)}
                    onClick={() => {
                      setTagState(option.slug, state === 'EXCLUDE' ? 'NEUTRAL' : 'EXCLUDE');
                    }}
                  >
                    <VeloraIcon name="minus" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="language-filter-section" aria-labelledby="language-filter-title">
          <div className="tag-filter-heading">
            <div>
              <h3 id="language-filter-title">{labels.language}</h3>
              <small>{labels.languageSelection(filters.languages.length)}</small>
            </div>
          </div>
          <label className="tag-filter-search">
            <span className="sr-only">{labels.language}</span>
            <VeloraIcon name="search" />
            <input
              type="search"
              value={languageSearch}
              placeholder={labels.languagePlaceholder}
              aria-label={labels.language}
              onChange={(event) => {
                setLanguageSearch(event.currentTarget.value);
              }}
            />
          </label>
          <small className="tag-filter-count" role="status">
            {labels.languageResults(visibleLanguageOptions.length)}
          </small>
          <div
            className="language-filter-list"
            role="list"
            aria-label={labels.language}
            tabIndex={0}
          >
            {languageOptionsLoading ? <p className="meta">{labels.loadingLanguages}</p> : null}
            {!languageOptionsLoading && visibleLanguageOptions.length === 0 ? (
              <p className="meta">{labels.noLanguages}</p>
            ) : null}
            {visibleLanguageOptions.map((option) => {
              const selected = filters.languages.includes(option.code);
              return (
                <div
                  className={selected ? 'language-filter-row is-selected' : 'language-filter-row'}
                  role="listitem"
                  key={option.code}
                >
                  <button
                    className="tag-include-control"
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    aria-label={labels.selectLanguage(option.nativeName)}
                    onClick={() => {
                      toggleLanguage(option.code);
                    }}
                  >
                    <span aria-hidden="true">
                      {selected ? <VeloraIcon name="check" size={16} /> : null}
                    </span>
                  </button>
                  <span className="language-filter-name" dir={option.direction}>
                    {option.nativeName}
                  </span>
                  <span className="tag-filter-usage">{option.usageCount.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          {showGroupSizes ? (
            <section className="group-size-filter-section" aria-labelledby="group-size-title">
              <div className="tag-filter-heading">
                <div>
                  <h3 id="group-size-title">{labels.groupSize}</h3>
                  <small>{labels.groupSizeSelection(filters.groupSizes.length)}</small>
                </div>
              </div>
              <div className="group-size-filter-list" role="list" aria-label={labels.groupSize}>
                {groupSizeOptionsLoading ? (
                  <p className="meta">{labels.loadingGroupSizes}</p>
                ) : null}
                {!groupSizeOptionsLoading && groupSizeOptions.length === 0 ? (
                  <p className="meta">{labels.noGroupSizes}</p>
                ) : null}
                {groupSizeOptions.map((option) => {
                  const selected = filters.groupSizes.includes(option.code);
                  const name = labels.groupSizeLabels[option.code];
                  return (
                    <div
                      className={
                        selected ? 'group-size-filter-row is-selected' : 'group-size-filter-row'
                      }
                      role="listitem"
                      key={option.code}
                    >
                      <button
                        className="tag-include-control"
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        aria-label={labels.selectGroupSize(name)}
                        onClick={() => {
                          toggleGroupSize(option.code);
                        }}
                      >
                        <span aria-hidden="true">
                          {selected ? <VeloraIcon name="check" size={16} /> : null}
                        </span>
                      </button>
                      <span className="language-filter-name">{name}</span>
                      <span className="tag-filter-usage">{option.usageCount.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </section>
      )}
      <div className="filter-secondary-grid">
        <button
          className="filter-facet-toggle"
          type="button"
          aria-pressed={activeFacet === 'languages'}
          onClick={() => {
            setActiveFacet(activeFacet === 'tags' ? 'languages' : 'tags');
          }}
        >
          <VeloraIcon name={activeFacet === 'tags' ? 'chevronRight' : 'chevronLeft'} size={18} />
          {activeFacet === 'tags'
            ? labels.languagesFacet(filters.languages.length)
            : labels.tagsFacet(filters.includeTags.length + filters.excludeTags.length)}
        </button>
        <label className="field filter-secondary-field">
          <span>{labels.rating}</span>
          <select
            name="discoveryRating"
            value={filters.rating}
            onChange={(event) => {
              const rating = event.currentTarget.value;
              if (rating === 'ALL' || rating === 'SAFE' || rating === 'MATURE') {
                onChange({ ...filters, rating });
              }
            }}
          >
            <option value="ALL">{labels.allRatings}</option>
            <option value="SAFE">{labels.safe}</option>
            <option value="MATURE">{labels.mature}</option>
          </select>
        </label>
      </div>
      <div className="dialog-actions">
        <button type="button" onClick={onReset}>
          {labels.reset}
        </button>
        <button className="primary" type="button" onClick={onApply}>
          {labels.apply}
        </button>
      </div>
    </Sheet>
  );
}

export function Dropdown({
  label,
  name,
  defaultValue,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue: string;
  readonly value?: string;
  readonly options: readonly (readonly [string, string])[];
  readonly onChange?: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        name={name}
        {...(value === undefined ? { defaultValue } : { value })}
        onChange={(event) => {
          onChange?.(event.currentTarget.value);
        }}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PersonaCard({
  avatar,
  name,
  description,
  badges,
  actionsLabel,
  editLabel,
  defaultLabel,
  removeLabel,
  isDefault,
  onEdit,
  onMakeDefault,
  onRemove,
}: {
  readonly avatar: ReactNode;
  readonly name: string;
  readonly description: string;
  readonly badges: readonly string[];
  readonly actionsLabel: string;
  readonly editLabel: string;
  readonly defaultLabel: string;
  readonly removeLabel: string;
  readonly isDefault: boolean;
  readonly onEdit: () => void;
  readonly onMakeDefault: () => void;
  readonly onRemove: () => void;
}) {
  return (
    <article className="list-card persona-card">
      {avatar}
      <div className="list-copy">
        <h2>{name}</h2>
        <p>{description}</p>
        <div className="tag-list">
          {badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      </div>
      <ActionMenu
        label={actionsLabel}
        items={[
          { label: editLabel, onSelect: onEdit },
          ...(!isDefault ? [{ label: defaultLabel, onSelect: onMakeDefault }] : []),
          { label: removeLabel, danger: true, onSelect: onRemove },
        ]}
      />
    </article>
  );
}

export function PlanCard({
  stars,
  title,
  description,
  detail,
  benefits,
  badge,
  priceLabel,
  current,
  premium,
  actionLabel,
  disabled,
  onPurchase,
}: {
  readonly stars: number | null;
  readonly title: string;
  readonly description: string;
  readonly detail: string;
  readonly benefits: readonly string[];
  readonly badge?: string | undefined;
  readonly priceLabel: string;
  readonly current: boolean;
  readonly premium: boolean;
  readonly actionLabel: string;
  readonly disabled: boolean;
  readonly onPurchase?: (() => void) | undefined;
}) {
  return (
    <article
      className={`billing-pack plan-card${premium ? ' plan-card-premium' : ''}${current ? ' plan-card-current' : ''}`}
    >
      <div className="plan-card-heading">
        <span className="plan-card-kicker">{detail}</span>
        {badge ? <span className="plan-card-badge">{badge}</span> : null}
      </div>
      <div className="plan-card-copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <ul className="plan-benefits">
        {benefits.map((benefit) => (
          <li key={benefit}>
            <VeloraIcon name="check" size={18} />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
      <div className="plan-card-purchase">
        <strong className="plan-card-price">
          {stars === null ? null : <VeloraIcon name="star" size={18} />}
          {priceLabel}
        </strong>
        {onPurchase ? (
          <button className="primary" type="button" disabled={disabled} onClick={onPurchase}>
            {actionLabel}
          </button>
        ) : (
          <span className="plan-card-included" role="status">
            {actionLabel}
          </span>
        )}
      </div>
    </article>
  );
}

export function PlanCarousel({
  label,
  children,
  previousLabel,
  nextLabel,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly previousLabel: string;
  readonly nextLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const count = Children.count(children);
  const goTo = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const cards = [...track.querySelectorAll<HTMLElement>('.plan-card')];
    const boundedIndex = Math.max(0, Math.min(index, cards.length - 1));
    const target = cards[boundedIndex];
    if (!target) return;
    setActiveIndex(boundedIndex);
    track.scrollTo({
      left: target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2,
      behavior: 'smooth',
    });
  };
  const move = (direction: -1 | 1) => {
    goTo(activeIndex + direction);
  };
  return (
    <div className="plan-carousel-shell" role="region" aria-label={label}>
      <div
        ref={trackRef}
        className="billing-grid plan-card-stack"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          move(event.key === 'ArrowLeft' ? -1 : 1);
        }}
        onScroll={(event) => {
          const track = event.currentTarget;
          const cards = [...track.querySelectorAll<HTMLElement>('.plan-card')];
          if (cards.length === 0) return;
          const center = track.scrollLeft + track.clientWidth / 2;
          let closest = 0;
          let distance = Number.POSITIVE_INFINITY;
          cards.forEach((card, index) => {
            const nextDistance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
            if (nextDistance < distance) {
              closest = index;
              distance = nextDistance;
            }
          });
          setActiveIndex(closest);
        }}
      >
        {children}
      </div>
      <div className="plan-carousel-controls">
        <button
          type="button"
          aria-label={previousLabel}
          disabled={activeIndex === 0}
          onClick={() => {
            move(-1);
          }}
        >
          <VeloraIcon name="chevronLeft" />
        </button>
        <div className="plan-carousel-dots" aria-label={label} role="group">
          {Array.from({ length: count }, (_, index) => (
            <button
              type="button"
              className={index === activeIndex ? 'is-active' : undefined}
              aria-label={`${String(index + 1)} / ${String(count)}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              key={index}
              onClick={() => {
                goTo(index);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label={nextLabel}
          disabled={activeIndex >= count - 1}
          onClick={() => {
            move(1);
          }}
        >
          <VeloraIcon name="chevronRight" />
        </button>
      </div>
    </div>
  );
}
