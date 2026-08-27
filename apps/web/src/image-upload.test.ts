import { describe, expect, it } from 'vitest';
import { calculateCoverCrop, maxClientSourceBytes, validateClientImage } from './image-upload';

describe('image upload preprocessing', () => {
  it('crops a landscape image around the selected focal point', () => {
    expect(calculateCoverCrop(2_000, 1_000, 8 / 5, 0, 50)).toEqual({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 1_600,
      sourceHeight: 1_000,
    });
    expect(calculateCoverCrop(2_000, 1_000, 8 / 5, 100, 50).sourceX).toBe(400);
  });

  it('crops a portrait image vertically around the selected focal point', () => {
    const crop = calculateCoverCrop(1_000, 2_000, 1, 50, 75);
    expect(crop.sourceX).toBe(0);
    expect(crop.sourceY).toBe(750);
    expect(crop.sourceWidth).toBe(1_000);
    expect(crop.sourceHeight).toBe(1_000);
  });

  it('rejects spoof-prone and oversized client inputs before decoding', () => {
    expect(() => {
      validateClientImage({ type: 'image/svg+xml', size: 1_000 });
    }).toThrow('IMAGE_TYPE_UNSUPPORTED');
    expect(() => {
      validateClientImage({ type: 'image/png', size: maxClientSourceBytes + 1 });
    }).toThrow('IMAGE_SIZE_INVALID');
  });
});
