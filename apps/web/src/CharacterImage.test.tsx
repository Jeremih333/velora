// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CharacterImage,
  classifyCharacterImageGeometry,
  normalizeFocalPoint,
} from './CharacterImage';

describe('character image focal rendering', () => {
  it('classifies portrait, landscape, unusual and invalid geometry', () => {
    expect(classifyCharacterImageGeometry(800, 800)).toBe('square');
    expect(classifyCharacterImageGeometry(800, 1200)).toBe('portrait');
    expect(classifyCharacterImageGeometry(1600, 900)).toBe('landscape');
    expect(classifyCharacterImageGeometry(4000, 500)).toBe('extreme-landscape');
    expect(classifyCharacterImageGeometry(500, 4000)).toBe('extreme-portrait');
    expect(classifyCharacterImageGeometry(0, 1200)).toBe('invalid');
  });

  it('clamps persisted focal coordinates before applying object-position', () => {
    render(
      <CharacterImage
        fileId="image-id"
        alt="Character"
        focalX={-5}
        focalY={140}
        fallback={<span>fallback</span>}
      />,
    );
    expect(screen.getByRole('img').getAttribute('style')).toContain('object-position: 0% 100%');
    expect(normalizeFocalPoint(Number.NaN)).toBe(50);
  });

  it('reports natural geometry and replaces failed media with a stable fallback', () => {
    const onGeometry = vi.fn();
    const view = render(
      <CharacterImage
        fileId="broken-image"
        alt="Character"
        fallback={<span>safe fallback</span>}
        onGeometry={onGeometry}
      />,
    );
    const image = view.container.querySelector('img');
    expect(image).not.toBeNull();
    if (image) fireEvent.error(image);
    expect(view.container.textContent).toContain('safe fallback');
    expect(onGeometry).toHaveBeenCalledWith('invalid');
  });

  it('opens an avatar preview and closes it by backdrop, close button and Escape', () => {
    const view = render(
      <CharacterImage fileId="avatar-id" alt="Alice" fallback={<span>A</span>} previewable />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Открыть аватар: Alice' }));
    expect(screen.getByRole('dialog', { name: 'Аватар: Alice' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog', { name: 'Аватар: Alice' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть аватар: Alice' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Аватар: Alice' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Открыть аватар: Alice' }));
    fireEvent.click(screen.getByRole('dialog', { name: 'Аватар: Alice' }));
    expect(screen.queryByRole('dialog', { name: 'Аватар: Alice' })).toBeNull();
    view.unmount();
  });
});
