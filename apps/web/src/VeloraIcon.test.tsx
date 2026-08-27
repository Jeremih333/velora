// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VeloraIcon } from './VeloraIcon';

describe('VeloraIcon', () => {
  it('keeps decorative SVGs out of the accessibility tree while the control owns its label', () => {
    render(
      <button type="button" aria-label="Открыть меню">
        <VeloraIcon name="menu" />
      </button>,
    );

    const button = screen.getByRole('button', { name: 'Открыть меню' });
    const icon = button.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('focusable')).toBe('false');
    expect(icon?.getAttribute('width')).toBe('20');
    expect(icon?.getAttribute('height')).toBe('20');
  });

  it('renders typed semantic variants without injecting raw SVG markup at call sites', () => {
    const { container } = render(
      <div>
        <VeloraIcon name="search" size={24} />
        <VeloraIcon name="shield" size={18} />
        <VeloraIcon name="star" size={16} />
      </div>,
    );

    expect(container.querySelectorAll('svg')).toHaveLength(3);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('24');
  });
});
