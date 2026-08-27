import {
  createContext,
  forwardRef,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type RefObject,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { VeloraIcon, type VeloraIconName } from './VeloraIcon';
import { useModalFocus } from './CoreComponents';
import type { RoleplayModelCatalogItem } from './types';

export function ChatHeader({ children }: { readonly children: ReactNode }) {
  return <header className="chat-header">{children}</header>;
}

export function ChatMenuRow({
  icon,
  title,
  hint,
  badge = false,
  danger = false,
  selected = false,
  onClick,
}: {
  readonly icon: VeloraIconName;
  readonly title: string;
  readonly hint: string;
  readonly badge?: boolean;
  readonly danger?: boolean;
  readonly selected?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      className={`chat-menu-row${danger ? ' is-danger' : ''}${selected ? ' is-selected' : ''}`}
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
    >
      <span className="chat-menu-row-icon" aria-hidden="true">
        <VeloraIcon name={icon} size={18} />
      </span>
      <span className="chat-menu-row-text">
        <strong>
          {title}
          {badge ? <i className="chat-menu-row-dot" aria-hidden="true" /> : null}
        </strong>
        <small>{hint}</small>
      </span>
      <span className="chat-menu-row-chevron" aria-hidden="true">
        <VeloraIcon name="chevronRight" size={16} />
      </span>
    </button>
  );
}

export const MessageList = forwardRef<
  HTMLDivElement,
  Omit<HTMLAttributes<HTMLDivElement>, 'className'>
>(function MessageList(props, ref) {
  return <div {...props} className="message-list" ref={ref} />;
});

export function ChatComposer({
  children,
  ...props
}: Omit<FormHTMLAttributes<HTMLFormElement>, 'className'>) {
  return (
    <form {...props} className="chat-composer">
      {children}
    </form>
  );
}

export function ModelQuickPicker({
  label,
  models,
  selectedId,
  pending,
  onSelect,
  onClose,
  onOpenCatalog,
  onOpenSettings,
  labels,
}: {
  readonly label: string;
  readonly models: readonly RoleplayModelCatalogItem[];
  readonly selectedId: string | null;
  readonly pending: boolean;
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
  readonly onOpenCatalog: () => void;
  readonly onOpenSettings: () => void;
  readonly labels: {
    readonly selected: string;
    readonly free: string;
    readonly standard: string;
    readonly premium: string;
    readonly providerUnavailable: string;
    readonly planUnavailable: string;
    readonly openCatalog: string;
    readonly generationSettings: string;
    readonly close: string;
  };
}) {
  const dialog = useModalFocus<HTMLElement>(onClose);
  return (
    <section
      ref={dialog}
      className="chat-model-picker"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      <header className="chat-model-picker-header">
        <strong>{label}</strong>
        <button type="button" aria-label={labels.close} onClick={onClose}>
          <VeloraIcon name="close" />
        </button>
      </header>
      <div className="chat-model-picker-list">
        {models.map((model) => {
          const selectable = model.available && model.allowed;
          const availabilityLabel = !model.available
            ? labels.providerUnavailable
            : !model.allowed
              ? labels.planUnavailable
              : null;
          return (
            <button
              type="button"
              className={model.id === selectedId ? 'is-selected' : ''}
              aria-pressed={model.id === selectedId}
              key={model.id}
              disabled={pending || !selectable}
              onClick={() => {
                onSelect(model.id);
              }}
            >
              <span className="chat-model-picker-copy">
                <span className="chat-model-picker-name">
                  <strong>{model.displayName}</strong>
                  <span className={`model-tier-badge is-${model.tier}`}>
                    {model.tier === 'free'
                      ? labels.free
                      : model.tier === 'premium'
                        ? labels.premium
                        : labels.standard}
                  </span>
                </span>
                <small>{model.descriptionRu}</small>
                <span className="chat-model-best-for">{model.bestForRu}</span>
                {availabilityLabel ? (
                  <span className="model-availability">{availabilityLabel}</span>
                ) : null}
              </span>
              {model.id === selectedId ? (
                <span className="selected-model-mark" aria-label={labels.selected}>
                  <VeloraIcon name="check" size={16} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <footer className="chat-model-picker-footer">
        <button type="button" onClick={onOpenCatalog}>
          <span>{labels.openCatalog}</span>
          <VeloraIcon name="arrowRight" />
        </button>
        <button type="button" onClick={onOpenSettings}>
          <span>{labels.generationSettings}</span>
          <VeloraIcon name="arrowRight" />
        </button>
      </footer>
    </section>
  );
}

export const ModelPicker = ModelQuickPicker;

interface ModelCatalogLabels {
  readonly bestFor: (value: string) => string;
  readonly speed: (value: string) => string;
  readonly quality: (value: string) => string;
  readonly roleplay: (value: string) => string;
  readonly memory: (value: string) => string;
  readonly provider: (value: string) => string;
  readonly cost: (value: string) => string;
  readonly context: (value: number) => string;
  readonly output: (value: number) => string;
  readonly free: string;
  readonly standard: string;
  readonly premium: string;
  readonly providerUnavailable: string;
  readonly planUnavailable: string;
  readonly restrictionNotice: string;
}

export function ModelCard({
  model,
  labels,
}: {
  readonly model: RoleplayModelCatalogItem;
  readonly labels: ModelCatalogLabels;
}) {
  return (
    <article className="model-catalog-card">
      <div className="model-catalog-card-title">
        <strong>{model.displayName}</strong>
        <span className={`model-tier-badge is-${model.tier}`}>
          {model.tier === 'free'
            ? labels.free
            : model.tier === 'premium'
              ? labels.premium
              : labels.standard}
        </span>
      </div>
      <p>{model.descriptionRu}</p>
      <dl>
        <div>
          <dt>{labels.bestFor(model.bestForRu)}</dt>
        </div>
        <div>
          <dt>{labels.speed(model.speedLabel)}</dt>
          <dt>{labels.quality(model.qualityLabel)}</dt>
        </div>
        <div>
          <dt>{labels.roleplay(model.roleplayLabel)}</dt>
          <dt>{labels.memory(model.memoryLabel)}</dt>
        </div>
        <div>
          <dt>{labels.provider(model.providerLabel)}</dt>
          <dt>{labels.cost(model.costLabelRu)}</dt>
        </div>
        <div>
          <dt>{labels.context(model.contextWindow)}</dt>
          <dt>{labels.output(model.maxOutput)}</dt>
        </div>
      </dl>
      {!model.available ? (
        <span className="model-availability">{labels.providerUnavailable}</span>
      ) : !model.allowed ? (
        <span className="model-availability">{labels.planUnavailable}</span>
      ) : null}
    </article>
  );
}

export function ModelCatalog({
  label,
  description,
  models,
  onClose,
  closeLabel,
  labels,
}: {
  readonly label: string;
  readonly description: string;
  readonly models: readonly RoleplayModelCatalogItem[];
  readonly onClose: () => void;
  readonly closeLabel: string;
  readonly labels: ModelCatalogLabels;
}) {
  const dialog = useModalFocus<HTMLElement>(onClose);
  return (
    <section
      ref={dialog}
      className="model-catalog-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      <header>
        <span>
          <strong>{label}</strong>
          <small>{description}</small>
          <small className="model-policy-note">{labels.restrictionNotice}</small>
        </span>
        <button type="button" aria-label={closeLabel} onClick={onClose}>
          <VeloraIcon name="close" />
        </button>
      </header>
      <div className="model-catalog-list" tabIndex={0} aria-label={label}>
        {models.map((model) => (
          <ModelCard key={model.id} model={model} labels={labels} />
        ))}
      </div>
    </section>
  );
}

export const ModelCatalogDialog = ModelCatalog;

export interface MessageMenuPlacementInput {
  readonly trigger: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>;
  readonly menuWidth: number;
  readonly menuHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly align: 'start' | 'end';
}

export interface MessageMenuPlacement {
  readonly mode: 'anchored-above' | 'anchored-below' | 'bottom-sheet';
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
}

export function calculateMessageMenuPlacement({
  trigger,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  align,
}: MessageMenuPlacementInput): MessageMenuPlacement {
  const gutter = 12;
  const gap = 8;
  const safeWidth = Math.max(0, viewportWidth - gutter * 2);
  const width = Math.min(Math.max(menuWidth, 220), safeWidth);
  const boundedHeight = Math.min(menuHeight, Math.max(0, viewportHeight - gutter * 2));
  const spaceBelow = viewportHeight - trigger.bottom - gutter - gap;
  const spaceAbove = trigger.top - gutter - gap;
  const isMobile = viewportWidth <= 640;
  if (isMobile && Math.max(spaceBelow, spaceAbove) < boundedHeight) {
    const sheetHeight = Math.min(menuHeight, Math.max(0, viewportHeight * 0.72));
    return {
      mode: 'bottom-sheet',
      top: Math.max(gutter, viewportHeight - sheetHeight - gutter),
      left: gutter,
      width: safeWidth,
      maxHeight: Math.max(0, viewportHeight * 0.72),
    };
  }
  const below = spaceBelow >= boundedHeight || spaceBelow >= spaceAbove;
  const preferredTop = below ? trigger.bottom + gap : trigger.top - boundedHeight - gap;
  const top = Math.min(
    Math.max(gutter, preferredTop),
    Math.max(gutter, viewportHeight - boundedHeight - gutter),
  );
  const preferredLeft = align === 'end' ? trigger.right - width : trigger.left;
  return {
    mode: below ? 'anchored-below' : 'anchored-above',
    top,
    left: Math.min(
      Math.max(gutter, preferredLeft),
      Math.max(gutter, viewportWidth - width - gutter),
    ),
    width,
    maxHeight: Math.max(0, below ? spaceBelow : spaceAbove),
  };
}

const MessageActionAnchorContext = createContext<RefObject<HTMLButtonElement | null> | null>(null);

export function MessageActionMenu({
  label,
  align,
  children,
}: {
  readonly label: string;
  readonly align: 'start' | 'end';
  readonly children: ReactNode;
}) {
  const triggerRef = useContext(MessageActionAnchorContext);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<MessageMenuPlacement | null>(null);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef?.current;
    if (!menu || !trigger) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect();
        setPlacement(
          calculateMessageMenuPlacement({
            trigger: trigger.getBoundingClientRect(),
            menuWidth: menu.scrollWidth || menuRect.width,
            menuHeight: menu.scrollHeight || menuRect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            align,
          }),
        );
      });
    };
    update();
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [align, triggerRef]);
  const style: CSSProperties | undefined = placement
    ? {
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
      }
    : undefined;
  const menu = (
    <div
      ref={menuRef}
      className={`message-actions is-${align}`}
      role="menu"
      aria-label={label}
      data-placement={placement?.mode ?? 'measuring'}
      style={style}
    >
      {children}
    </div>
  );
  return typeof document === 'undefined' ? menu : createPortal(menu, document.body);
}

export function MessageMenuItem({
  icon,
  children,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon: VeloraIconName;
}) {
  return (
    <button {...buttonProps} type="button" role="menuitem">
      <span className="message-action-icon" aria-hidden="true">
        <VeloraIcon name={icon} size={18} />
      </span>
      <span>{children}</span>
    </button>
  );
}

export type MessageReaction = 'POSITIVE' | 'NEGATIVE' | 'EXCEPTIONAL';

export function ReactionPopover({
  label,
  current,
  pending,
  onSelect,
  labels,
}: {
  readonly label: string;
  readonly current: MessageReaction | null;
  readonly pending: boolean;
  readonly onSelect: (reaction: MessageReaction) => void;
  readonly labels: Readonly<Record<MessageReaction, string>>;
}) {
  const reactions = [
    { value: 'POSITIVE', icon: 'thumbsUp' },
    { value: 'NEGATIVE', icon: 'thumbsDown' },
    { value: 'EXCEPTIONAL', icon: 'sparkle' },
  ] as const;
  return (
    <div className="message-reaction-popover" role="group" aria-label={label}>
      {reactions.map((reaction) => (
        <button
          className="message-action-trigger"
          type="button"
          key={reaction.value}
          aria-label={labels[reaction.value]}
          aria-pressed={current === reaction.value}
          disabled={pending}
          onClick={() => {
            onSelect(reaction.value);
          }}
        >
          <VeloraIcon name={reaction.icon} />
        </button>
      ))}
    </div>
  );
}

export const MessageReactionPopover = ReactionPopover;

export function MessageBubble({
  role,
  body,
  editedLabel,
  timeLabel,
  actionLabel,
  actionOpen,
  onToggleActions,
  reaction,
  variants,
  children,
}: {
  readonly role: 'USER' | 'ASSISTANT';
  readonly body: ReactNode;
  readonly editedLabel: string | null;
  readonly timeLabel: string;
  readonly actionLabel: string;
  readonly actionOpen: boolean;
  readonly onToggleActions: () => void;
  readonly reaction?: {
    readonly label: string;
    readonly current: MessageReaction | null;
    readonly open: boolean;
    readonly onToggle: () => void;
  };
  readonly variants?: {
    readonly label: string;
    readonly previousLabel: string;
    readonly nextLabel: string;
    readonly index: number;
    readonly count: number;
    readonly onPrevious: () => void;
    readonly onNext: () => void;
  };
  readonly children?: ReactNode;
}) {
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  return (
    <MessageActionAnchorContext.Provider value={actionTriggerRef}>
      <article className={`message-bubble ${role === 'USER' ? 'is-user' : 'is-character'}`}>
        {body}
        <footer className="message-meta">
          {editedLabel ? <span>{editedLabel}</span> : null}
          <time>{timeLabel}</time>
          {reaction ? (
            <button
              className="message-reaction-trigger"
              type="button"
              aria-label={reaction.label}
              aria-expanded={reaction.open}
              onClick={reaction.onToggle}
            >
              <VeloraIcon
                name={
                  reaction.current === 'POSITIVE'
                    ? 'thumbsUp'
                    : reaction.current === 'NEGATIVE'
                      ? 'thumbsDown'
                      : reaction.current === 'EXCEPTIONAL'
                        ? 'sparkle'
                        : 'star'
                }
                size={18}
              />
            </button>
          ) : null}
          <button
            ref={actionTriggerRef}
            className="message-action-trigger"
            type="button"
            aria-label={actionLabel}
            aria-expanded={actionOpen}
            onClick={onToggleActions}
          >
            <VeloraIcon name="moreHorizontal" size={18} />
          </button>
        </footer>
        {variants && variants.count > 1 ? (
          <nav className="message-variants" aria-label={variants.label}>
            <button
              type="button"
              aria-label={variants.previousLabel}
              disabled={variants.index <= 0}
              onClick={variants.onPrevious}
            >
              <span aria-hidden="true">{'<'}</span>
            </button>
            <span>
              {variants.index + 1} / {variants.count}
            </span>
            <button
              type="button"
              aria-label={variants.nextLabel}
              disabled={variants.index >= variants.count - 1}
              onClick={variants.onNext}
            >
              <span aria-hidden="true">{'>'}</span>
            </button>
          </nav>
        ) : null}
        {children}
      </article>
    </MessageActionAnchorContext.Provider>
  );
}
