import { describe, expect, it } from 'vitest';
import {
  assertSafeImageGeometry,
  detectImageType,
  inspectImage,
  selectTelegramImage,
} from './telegram-media';

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

  it('reads real dimensions from PNG, progressive JPEG and every supported WebP header', () => {
    expect(inspectImage(pngFixture(800, 600))).toEqual({
      mimeType: 'image/png',
      width: 800,
      height: 600,
    });
    expect(inspectImage(jpegFixture(1024, 768, 0xc2))).toEqual({
      mimeType: 'image/jpeg',
      width: 1024,
      height: 768,
    });
    expect(inspectImage(webpExtendedFixture(320, 240))).toEqual({
      mimeType: 'image/webp',
      width: 320,
      height: 240,
    });
    expect(inspectImage(webpLosslessFixture(513, 257))).toEqual({
      mimeType: 'image/webp',
      width: 513,
      height: 257,
    });
    expect(inspectImage(webpLossyFixture(640, 360))).toEqual({
      mimeType: 'image/webp',
      width: 640,
      height: 360,
    });
  });

  it('rejects malformed headers, declared-size mismatches and decompression-bomb geometry', () => {
    expect(inspectImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]))).toBeNull();
    const image = inspectImage(pngFixture(800, 600));
    if (!image) throw new Error('PNG fixture inspection failed.');
    expect(() => {
      assertSafeImageGeometry(image, {
        fileId: 'file',
        uniqueId: 'unique',
        declaredSize: 24,
        width: 801,
        height: 600,
        originalName: null,
      });
    }).toThrow(expect.objectContaining({ code: 'MEDIA_DIMENSIONS_MISMATCH' }));
    const huge = inspectImage(pngFixture(8_000, 8_000));
    if (!huge) throw new Error('Large PNG fixture inspection failed.');
    expect(() => {
      assertSafeImageGeometry(huge, {
        fileId: 'file',
        uniqueId: 'unique',
        declaredSize: 24,
        width: null,
        height: null,
        originalName: null,
      });
    }).toThrow(expect.objectContaining({ code: 'MEDIA_DIMENSIONS_TOO_LARGE' }));
  });
});

function pngFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10], 0);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return bytes;
}

function jpegFixture(width: number, height: number, marker: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    marker,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
  ]);
}

function webpExtendedFixture(width: number, height: number): Uint8Array {
  const bytes = webpBase('VP8X');
  writeUint24LittleEndian(bytes, 24, width - 1);
  writeUint24LittleEndian(bytes, 27, height - 1);
  return bytes;
}

function webpLosslessFixture(width: number, height: number): Uint8Array {
  const bytes = webpBase('VP8L');
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes[20] = 0x2f;
  bytes[21] = widthMinusOne & 0xff;
  bytes[22] = ((widthMinusOne >> 8) & 0x3f) | ((heightMinusOne & 0x03) << 6);
  bytes[23] = (heightMinusOne >> 2) & 0xff;
  bytes[24] = (heightMinusOne >> 10) & 0x0f;
  return bytes;
}

function webpLossyFixture(width: number, height: number): Uint8Array {
  const bytes = webpBase('VP8 ');
  bytes.set([0x9d, 0x01, 0x2a], 23);
  bytes[26] = width & 0xff;
  bytes[27] = width >> 8;
  bytes[28] = height & 0xff;
  bytes[29] = height >> 8;
  return bytes;
}

function webpBase(chunk: string): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBP'), 8);
  bytes.set(new TextEncoder().encode(chunk), 12);
  return bytes;
}

function writeUint24LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
}
