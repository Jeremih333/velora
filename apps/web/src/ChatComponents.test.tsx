// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateMessageMenuPlacement,
  MessageActionMenu,
  MessageBubble,
  MessageMenuItem,
  MessageReactionPopover,
  ModelCatalogDialog,
  ModelPicker,
} from './ChatComponents';
import type { RoleplayModelCatalogItem } from './types';

afterEach(cleanup);

const model = (
  id: string,
  input: Partial<RoleplayModelCatalogItem> = {},
): RoleplayModelCatalogItem => ({
  id,
  displayName: id,
  descriptionRu: 'Описание',
  bestForRu: 'Ролевые истории',
  speedLabel: 'Быстро',
  qualityLabel: 'Хорошо',
  roleplayLabel: 'Хорошо',
  memoryLabel: 'Средняя',
  providerLabel: 'BotHub',
  costLabelRu: 'Очень низкий',
  contextWindow: 8192,
  maxOutput: 1024,
  tier: 'free',
  experimental: false,
  supportsStreaming: true,
  available: true,
  allowed: true,
  ...input,
});

const pickerLabels = {
  selected: 'Выбрано',
  free: 'Free',
  standard: 'Standard',
  premium: 'Premium',
  providerUnavailable: 'Недоступно у провайдера',
  planUnavailable: 'Недоступно на тарифе',
  openCatalog: 'Открыть каталог',
  generationSettings: 'Настройки генерации',
  close: 'Закрыть',
} as const;

const pickerActions = () => ({
  onClose: vi.fn(),
  onOpenCatalog: vi.fn(),
  onOpenSettings: vi.fn(),
});

describe('ModelPicker', () => {
  it('shows availability for every model and submits only an allowed selection', () => {
    const onSelect = vi.fn();
    const actions = pickerActions();
    render(
      <ModelPicker
        label="Выбор модели"
        models={[
          model('balanced'),
          model('free-roleplay'),
          model('hidden', { available: false }),
          model('forbidden', { allowed: false }),
        ]}
        selectedId="balanced"
        pending={false}
        onSelect={onSelect}
        {...actions}
        labels={pickerLabels}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Выбор модели' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /balanced/u }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('hidden')).toBeTruthy();
    expect(screen.getByText('forbidden')).toBeTruthy();
    expect(screen.getByRole('button', { name: /hidden/u }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /forbidden/u }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /free-roleplay/u }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('free-roleplay');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть каталог' }));
    fireEvent.click(screen.getByRole('button', { name: 'Настройки генерации' }));
    expect(actions.onOpenCatalog).toHaveBeenCalledOnce();
    expect(actions.onOpenSettings).toHaveBeenCalledOnce();
  });

  it('disables every model while a selection is being saved', () => {
    render(
      <ModelPicker
        label="Выбор модели"
        models={[model('balanced'), model('free-roleplay')]}
        selectedId={null}
        pending
        onSelect={vi.fn()}
        {...pickerActions()}
        labels={pickerLabels}
      />,
    );
    expect(
      [...document.querySelectorAll('.chat-model-picker-list > button')].every((button) =>
        button.hasAttribute('disabled'),
      ),
    ).toBe(true);
  });

  it('keeps a large model catalogue selectable without dropping allowed entries', () => {
    const models = Array.from({ length: 120 }, (_, index) => model(`model-${String(index + 1)}`));
    const onSelect = vi.fn();
    render(
      <ModelPicker
        label="Каталог моделей"
        models={models}
        selectedId="model-1"
        pending={false}
        onSelect={onSelect}
        {...pickerActions()}
        labels={pickerLabels}
      />,
    );
    const renderedModelButtons = document.querySelectorAll<HTMLButtonElement>(
      '.chat-model-picker-list > button',
    );
    expect(renderedModelButtons).toHaveLength(120);
    const lastModelButton = renderedModelButtons.item(119);
    expect(lastModelButton.textContent).toContain('model-120');
    fireEvent.click(lastModelButton);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('model-120');
  });
});

describe('ModelCatalogDialog', () => {
  it('shows provider, CAPS category and the provider-policy notice without exposing prices', () => {
    render(
      <ModelCatalogDialog
        label="Каталог моделей"
        description="Сравнение моделей"
        models={[model('qwen', { displayName: 'Qwen Roleplay' })]}
        onClose={vi.fn()}
        closeLabel="Закрыть"
        labels={{
          bestFor: (value) => `Лучше всего: ${value}`,
          speed: (value) => `Скорость: ${value}`,
          quality: (value) => `Качество: ${value}`,
          roleplay: (value) => `Ролевая игра: ${value}`,
          memory: (value) => `Память: ${value}`,
          provider: (value) => `Провайдер: ${value}`,
          cost: (value) => `Расход CAPS: ${value}`,
          context: (value) => `Контекст: ${String(value)}`,
          output: (value) => `Ответ: ${String(value)}`,
          free: 'Free',
          standard: 'Standard',
          premium: 'Premium',
          providerUnavailable: 'Недоступна у провайдера',
          planUnavailable: 'Недоступна на тарифе',
          restrictionNotice: 'Некоторые темы могут ограничиваться правилами поставщика модели.',
        }}
      />,
    );

    expect(screen.getByText('Провайдер: BotHub')).toBeTruthy();
    expect(screen.getByText('Расход CAPS: Очень низкий')).toBeTruthy();
    expect(
      screen.getByText('Некоторые темы могут ограничиваться правилами поставщика модели.'),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\$|0\.20|0\.75/u);
  });
});

describe('MessageActionMenu', () => {
  it('portals an open message menu outside the animated bubble so it cannot be clipped', () => {
    const { container } = render(
      <MessageBubble
        role="ASSISTANT"
        body={<p>Ответ</p>}
        editedLabel={null}
        timeLabel="12:34"
        actionLabel="Действия"
        actionOpen
        onToggleActions={vi.fn()}
      >
        <MessageActionMenu label="Меню сообщения" align="end">
          <MessageMenuItem icon="copy">Копировать</MessageMenuItem>
        </MessageActionMenu>
      </MessageBubble>,
    );

    expect(container.querySelector('.message-bubble .message-actions')).toBeNull();
    expect(document.body.querySelector('.message-actions')).not.toBeNull();
    expect(screen.getByRole('menu', { name: 'Меню сообщения' })).toBeTruthy();
  });

  it('exposes its real actions as an accessible navigation menu', () => {
    const onEdit = vi.fn();
    render(
      <MessageActionMenu label="Действия с сообщением" align="end">
        <MessageMenuItem icon="edit" onClick={onEdit}>
          Редактировать
        </MessageMenuItem>
        <MessageMenuItem icon="delete">Удалить</MessageMenuItem>
      </MessageActionMenu>,
    );

    expect(screen.getByRole('menu', { name: 'Действия с сообщением' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Редактировать' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeTruthy();
  });

  it('keeps desktop menus anchored inside the viewport', () => {
    expect(
      calculateMessageMenuPlacement({
        trigger: { top: 700, right: 1000, bottom: 724, left: 974 },
        menuWidth: 290,
        menuHeight: 240,
        viewportWidth: 1024,
        viewportHeight: 768,
        align: 'end',
      }),
    ).toEqual({
      mode: 'anchored-above',
      top: 452,
      left: 710,
      width: 290,
      maxHeight: 680,
    });
  });

  it('uses a mobile bottom sheet only when neither anchored side fits', () => {
    expect(
      calculateMessageMenuPlacement({
        trigger: { top: 340, right: 220, bottom: 364, left: 194 },
        menuWidth: 290,
        menuHeight: 500,
        viewportWidth: 390,
        viewportHeight: 700,
        align: 'end',
      }),
    ).toEqual({
      mode: 'bottom-sheet',
      top: 188,
      left: 12,
      width: 366,
      maxHeight: 504,
    });
    expect(
      calculateMessageMenuPlacement({
        trigger: { top: 100, right: 46, bottom: 124, left: 20 },
        menuWidth: 290,
        menuHeight: 200,
        viewportWidth: 390,
        viewportHeight: 700,
        align: 'start',
      }).mode,
    ).toBe('anchored-below');
  });
});

describe('MessageBubble', () => {
  it('renders metadata and routes action/variant controls to their handlers', () => {
    const toggle = vi.fn();
    const previous = vi.fn();
    const next = vi.fn();
    render(
      <MessageBubble
        role="ASSISTANT"
        body={<p>Ответ персонажа</p>}
        editedLabel="изменено"
        timeLabel="12:34"
        actionLabel="Действия"
        actionOpen
        onToggleActions={toggle}
        variants={{
          label: 'Варианты',
          previousLabel: 'Предыдущий',
          nextLabel: 'Следующий',
          index: 1,
          count: 3,
          onPrevious: previous,
          onNext: next,
        }}
      >
        <span>Дополнительные действия</span>
      </MessageBubble>,
    );

    expect(screen.getByText('Ответ персонажа')).toBeTruthy();
    expect(screen.getByText('изменено')).toBeTruthy();
    expect(screen.getByText('12:34')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Действия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий' }));
    fireEvent.click(screen.getByRole('button', { name: 'Следующий' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('MessageReactionPopover', () => {
  it('offers all three reaction strengths and preserves the selected state', () => {
    const onSelect = vi.fn();
    render(
      <MessageReactionPopover
        label="Реакция на ответ"
        current="POSITIVE"
        pending={false}
        onSelect={onSelect}
        labels={{
          POSITIVE: 'Хороший ответ',
          NEGATIVE: 'Плохой ответ',
          EXCEPTIONAL: 'Исключительный ответ',
        }}
      />,
    );

    expect(screen.getByRole('group', { name: 'Реакция на ответ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Хороший ответ' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Плохой ответ' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Исключительный ответ' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('EXCEPTIONAL');
  });
});
