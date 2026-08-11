import { describe, expect, it } from 'vitest';
import { detectImageType, selectTelegramImage } from './telegram-media';

describe('Telegram image adapter', () => {
  it('selects the largest Telegram photo and accepts image documents only', () => {
    expect(
      selectTelegramImage(
        [
          { file_id: 'small', file_unique_id: 's', width: 90, height: 90 },
          { file_id: 'large', file_unique_id: 'l', width: 800, height: 800 },
        ],
        undefined,
      ),
    ).toMatchObject({ fileId: 'large', width: 800 });
    expect(
      selectTelegramImage(undefined, {
        file_id: 'doc',
        file_unique_id: 'd',
        mime_type: 'application/pdf',
      }),
    ).toBeNull();
  });

  it('detects image bytes instead of trusting an extension or declared MIME', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]))).toBe(
      'image/png',
    );
    expect(detectImageType(new TextEncoder().encode('not an image'))).toBeNull();
  });

  it('does not select a non-media message', () => {
    expect(selectTelegramImage(undefined, undefined)).toBeNull();
  });
});
