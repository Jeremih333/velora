import { describe, expect, it } from 'vitest';
import { selectMessageWindow } from './message-window';

describe('chat message window', () => {
  it('never renders a thousand-message history into the DOM at once', () => {
    const messages = Array.from({ length: 1_000 }, (_, index) => `message-${String(index + 1)}`);
    const firstWindow = selectMessageWindow(messages, 80);
    expect(firstWindow.visible).toHaveLength(80);
    expect(firstWindow.hiddenCount).toBe(920);
    expect(firstWindow.visible[0]).toBe('message-921');

    const expanded = selectMessageWindow(messages, 160);
    expect(expanded.visible).toHaveLength(160);
    expect(expanded.hiddenCount).toBe(840);
    expect(expanded.visible.at(-1)).toBe('message-1000');
  });
});
