import {
  useEffect,
  useId,
  useRef,
  useState,
  type AriaRole,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { visibleTokenEstimate } from './character-metrics';
import { localizedErrorMessage } from './error-localization';
import { useI18n } from './i18n';
import { VeloraIcon } from './VeloraIcon';

const modalFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModalFocus<T extends HTMLElement>(onClose: () => void) {
  const dialog = useRef<T>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const element = dialog.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!element) return;

    const focusableElements = () =>
      Array.from(element.querySelectorAll<HTMLElement>(modalFocusableSelector)).filter(
        (candidate) => !candidate.hidden && candidate.getAttribute('aria-hidden') !== 'true',
      );
    const initialFocus = focusableElements()[0] ?? element;
    initialFocus.focus();

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        element.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || !element.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', keepFocusInside);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return dialog;
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  return <main className="app-shell product-shell">{children}</main>;
}

export function TopBar({ children }: { readonly children: ReactNode }) {
  return <header className="topbar product-topbar">{children}</header>;
}

export function BottomNavigation({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <nav className="bottom-nav" aria-label={label}>
      {children}
    </nav>
  );
}

export function SearchBar({
  value,
  label,
  placeholder,
  submitLabel,
  onChange,
  onSubmit,
}: {
  readonly value: string;
  readonly label: string;
  readonly placeholder: string;
  readonly submitLabel: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  return (
    <form
      className="search-bar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
      <button type="submit">{submitLabel}</button>
    </form>
  );
}

export function FilterButton({
  label,
  active,
  expanded,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly expanded: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      className={active ? 'filter-trigger is-active' : 'filter-trigger'}
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export interface EntityTab<T extends string> {
  readonly id: T;
  readonly label: string;
}

export function EntityTabs<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly items: readonly EntityTab<T>[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <nav className="library-tabs" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          className={value === item.id ? 'is-active' : undefined}
          aria-current={value === item.id ? 'page' : undefined}
          key={item.id}
          onClick={() => {
            onChange(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function Counter({ label }: { readonly label: string }) {
  return <span className="character-counter">{label}</span>;
}

export function TokenCounter({ label }: { readonly label: string }) {
  return <span className="token-counter">{label}</span>;
}

function FieldMetrics({
  id,
  value,
  maxLength,
}: {
  readonly id: string;
  readonly value: string;
  readonly maxLength: number | undefined;
}) {
  const { messages } = useI18n();
  const combined = messages.characters.fieldMetrics(
    value.length,
    maxLength ?? null,
    visibleTokenEstimate(value),
  );
  const [characters = combined, tokens = ''] = combined.split('·', 2).map((part) => part.trim());
  return (
    <small className="field-metrics" id={id}>
      <Counter label={characters} />
      {tokens ? (
        <>
          <span aria-hidden="true"> · </span>
          <TokenCounter label={tokens} />
        </>
      ) : null}
    </small>
  );
}

export function FormField({
  label,
  name,
  defaultValue = '',
  onChange,
  metrics = false,
  maxLength,
  ...props
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue?: string | undefined;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly type?: 'text' | 'number';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number | string;
  readonly onChange?: (value: string) => void;
  readonly metrics?: boolean;
}) {
  const inputId = useId();
  const metricsId = `${inputId}-metrics`;
  const [metricValue, setMetricValue] = useState(defaultValue);
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        aria-describedby={metrics ? metricsId : undefined}
        {...props}
        onChange={(event) => {
          setMetricValue(event.currentTarget.value);
          onChange?.(event.currentTarget.value);
        }}
      />
      {metrics ? <FieldMetrics id={metricsId} value={metricValue} maxLength={maxLength} /> : null}
    </div>
  );
}

export function TextAreaField({
  label,
  name,
  defaultValue = '',
  onChange,
  metrics = false,
  maxLength,
  ...props
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue?: string | undefined;
  readonly required?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly onChange?: (value: string) => void;
  readonly metrics?: boolean;
}) {
  const inputId = useId();
  const metricsId = `${inputId}-metrics`;
  const [metricValue, setMetricValue] = useState(defaultValue);
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <textarea
        id={inputId}
        name={name}
        defaultValue={defaultValue}
        rows={4}
        maxLength={maxLength}
        aria-describedby={metrics ? metricsId : undefined}
        {...props}
        onChange={(event) => {
          setMetricValue(event.currentTarget.value);
          onChange?.(event.currentTarget.value);
        }}
      />
      {metrics ? <FieldMetrics id={metricsId} value={metricValue} maxLength={maxLength} /> : null}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export function SegmentedControl<T extends string>({
  label,
  name,
  defaultValue,
  options,
  description,
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly description?: string;
}) {
  return (
    <fieldset className="segmented-field">
      <legend>{label}</legend>
      <div className="segmented-control">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {description ? <p>{description}</p> : null}
    </fieldset>
  );
}

export function Checkbox({
  name,
  label,
  description,
  defaultChecked,
  disabled,
  className = 'choice-card',
}: {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly defaultChecked: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  return (
    <label className={className}>
      <input name={name} type="checkbox" defaultChecked={defaultChecked} disabled={disabled} />
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function Switch({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  readonly name: string;
  readonly label: string;
  readonly defaultChecked: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <label>
      <input
        name={name}
        type="checkbox"
        role="switch"
        defaultChecked={defaultChecked}
        disabled={disabled}
      />{' '}
      {label}
    </label>
  );
}

interface OverlayProps {
  readonly backdropClassName: string;
  readonly className: string;
  readonly labelledBy?: string;
  readonly label?: string;
  readonly role?: 'dialog' | 'alertdialog';
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function Dialog({
  backdropClassName,
  className,
  labelledBy,
  label,
  role = 'dialog',
  onClose,
  children,
}: OverlayProps) {
  const dialog = useModalFocus<HTMLElement>(onClose);
  return (
    <div
      className={backdropClassName}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className={className}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}

export function Sheet(props: OverlayProps) {
  return <Dialog {...props} />;
}

export function Popover({
  className,
  role,
  label,
  children,
  elementRef,
  style,
}: {
  readonly className: string;
  readonly role: AriaRole;
  readonly label: string;
  readonly children: ReactNode;
  readonly elementRef?: Ref<HTMLDivElement>;
  readonly style?: CSSProperties;
}) {
  return (
    <div ref={elementRef} className={className} role={role} aria-label={label} style={style}>
      {children}
    </div>
  );
}

export function Toast({ children }: { readonly children: ReactNode }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function Skeleton({ label, rows = 3 }: { readonly label: string; readonly rows?: number }) {
  return (
    <div className="view-stack loading-workspace" role="status" aria-busy="true">
      <span className="loading-orbit" aria-hidden="true" />
      <p>{label}</p>
      <div className="skeleton-list" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <span className="skeleton-avatar" />
            <span className="skeleton-copy">
              <span />
              <span />
              <span />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  readonly title: string;
  readonly text?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <VeloraIcon name="sparkle" />
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
      {action ? <div className="empty-state-actions">{action}</div> : null}
    </div>
  );
}

export function GreetingMessage({
  labelledBy,
  children,
}: {
  readonly labelledBy: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="greeting-block" aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export function ErrorState({
  error,
  retry,
}: {
  readonly error: Error;
  readonly retry: () => void;
}) {
  const { messages } = useI18n();
  return (
    <div className="error-panel" role="alert">
      <strong>{messages.common.sectionLoadFailed}</strong>
      <p>{localizedErrorMessage(error, messages)}</p>
      <button type="button" onClick={retry}>
        {messages.common.retry}
      </button>
    </div>
  );
}

export function SideDrawer({
  label,
  onClose,
  children,
}: {
  readonly label: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const dialog = useModalFocus<HTMLElement>(onClose);
  const swipe = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly startedAt: number;
  } | null>(null);

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="app-drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={dialog}
        className="app-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' || event.button !== 0) return;
          swipe.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startedAt: performance.now(),
          };
        }}
        onPointerUp={(event) => {
          const gesture = swipe.current;
          swipe.current = null;
          if (gesture?.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - gesture.startX;
          const deltaY = event.clientY - gesture.startY;
          const elapsed = performance.now() - gesture.startedAt;
          if (deltaX <= -72 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25 && elapsed <= 900) {
            onClose();
          }
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        {children}
      </aside>
    </div>
  );
}
