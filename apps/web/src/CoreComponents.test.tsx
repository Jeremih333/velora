// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  BottomNavigation,
  EntityTabs,
  FilterButton,
  FormField,
  SearchBar,
  SegmentedControl,
  SideDrawer,
  Skeleton,
  EmptyState,
  Switch,
  Toast,
  TopBar,
  TextAreaField,
  Checkbox,
} from './CoreComponents';
import { I18nProvider } from './i18n';

afterEach(cleanup);

describe('core application components', () => {
  it('keeps an empty-state recovery action visible and operable', () => {
    const recover = vi.fn();
    render(
      <EmptyState
        title="No chats"
        text="Start a story from Discover."
        action={
          <button type="button" onClick={recover}>
            Open Discover
          </button>
        }
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Discover' }));
    expect(recover).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Open Discover' }).closest('.empty-state'),
    ).not.toBeNull();
  });

  it('preserves the semantic shell, navigation, toast and loading state', () => {
    render(
      <AppShell>
        <TopBar>Velora</TopBar>
        <Toast>Saved</Toast>
        <Skeleton label="Loading chats" />
        <BottomNavigation label="Main navigation">
          <button type="button">Chats</button>
        </BottomNavigation>
      </AppShell>,
    );

    expect(screen.getByRole('main').classList.contains('product-shell')).toBe(true);
    expect(screen.getByRole('banner').classList.contains('product-topbar')).toBe(true);
    expect(screen.getByText('Saved').closest('[role="status"]')?.getAttribute('aria-live')).toBe(
      'polite',
    );
    expect(screen.getByText('Loading chats').closest('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelectorAll('.skeleton-card')).toHaveLength(3);
    expect(document.querySelector('.skeleton-list')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).not.toBeNull();
  });

  it('closes the shared side drawer through Escape, backdrop and a deliberate touch swipe', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    opener.textContent = 'Open menu';
    document.body.append(opener);
    opener.focus();
    const { container, unmount } = render(
      <SideDrawer label="Velora menu" onClose={onClose}>
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </SideDrawer>,
    );

    const firstAction = screen.getByRole('button', { name: 'First action' });
    const lastAction = screen.getByRole('button', { name: 'Last action' });
    expect(document.activeElement).toBe(firstAction);
    lastAction.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(firstAction);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastAction);
    fireEvent.keyDown(document, { key: 'Escape' });
    const backdrop = container.querySelector('.app-drawer-backdrop');
    if (!(backdrop instanceof HTMLElement))
      throw new Error('Side drawer backdrop was not rendered.');
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseDown(firstAction);
    const drawer = screen.getByRole('dialog', { name: 'Velora menu' });
    fireEvent.pointerDown(drawer, {
      pointerId: 7,
      pointerType: 'touch',
      button: 0,
      clientX: 240,
      clientY: 120,
    });
    fireEvent.pointerUp(drawer, {
      pointerId: 7,
      pointerType: 'touch',
      button: 0,
      clientX: 140,
      clientY: 128,
    });
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.pointerDown(drawer, {
      pointerId: 8,
      pointerType: 'touch',
      button: 0,
      clientX: 240,
      clientY: 120,
    });
    fireEvent.pointerUp(drawer, {
      pointerId: 8,
      pointerType: 'touch',
      button: 0,
      clientX: 220,
      clientY: 220,
    });
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('shares search, filter and entity-tab behavior across product views', () => {
    const onSearch = vi.fn();
    const onQueryChange = vi.fn();
    const onFilter = vi.fn();
    const onTab = vi.fn();
    render(
      <>
        <SearchBar
          value="moon"
          label="Search characters"
          placeholder="Name or tag"
          submitLabel="Search"
          onChange={onQueryChange}
          onSubmit={onSearch}
        />
        <FilterButton label="Filters · 2" active expanded={false} onClick={onFilter} />
        <EntityTabs
          label="Library"
          value="characters"
          items={[
            { id: 'characters', label: 'Characters' },
            { id: 'lorebooks', label: 'Lorebooks' },
          ]}
          onChange={onTab}
        />
      </>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search characters' }), {
      target: { value: 'forest' },
    });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.click(screen.getByRole('button', { name: 'Filters · 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lorebooks' }));

    expect(onQueryChange).toHaveBeenCalledWith('forest');
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onFilter).toHaveBeenCalledOnce();
    expect(onTab).toHaveBeenCalledWith('lorebooks');
    expect(screen.getByRole('button', { name: 'Characters' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('shares form fields and separates character and token counters', () => {
    render(
      <I18nProvider locale="en">
        <FormField label="Name" name="name" defaultValue="Velora" metrics maxLength={20} />
        <TextAreaField
          label="Description"
          name="description"
          defaultValue="A persistent story"
          metrics
          maxLength={200}
        />
      </I18nProvider>,
    );

    expect(screen.getAllByText(/characters/u)).toHaveLength(2);
    expect(screen.getAllByText(/tokens/u)).toHaveLength(2);
    expect(document.querySelectorAll('.character-counter')).toHaveLength(2);
    expect(document.querySelectorAll('.token-counter')).toHaveLength(2);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Velora AI' },
    });
    expect(screen.getByText(/9 \/ 20 characters/u)).not.toBeNull();
  });

  it('provides reusable segmented, checkbox and switch controls', () => {
    render(
      <>
        <SegmentedControl
          label="Visibility"
          name="visibility"
          defaultValue="private"
          options={[
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
          ]}
          description="Choose who can open it."
        />
        <Checkbox name="safe" label="Safe search" defaultChecked description="Hide mature." />
        <Switch name="enabled" label="Enabled" defaultChecked={false} />
      </>,
    );

    expect(screen.getByRole('radio', { name: 'Private' }).getAttribute('checked')).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: /Safe search/u })).not.toBeNull();
    expect(screen.getByRole('switch', { name: 'Enabled' })).not.toBeNull();
  });
});
