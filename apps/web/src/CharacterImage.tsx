import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type CharacterImageGeometry =
  'square' | 'portrait' | 'landscape' | 'extreme-portrait' | 'extreme-landscape' | 'invalid';

export function classifyCharacterImageGeometry(
  naturalWidth: number,
  naturalHeight: number,
): CharacterImageGeometry {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return 'invalid';
  }
  const ratio = naturalWidth / naturalHeight;
  if (ratio >= 3) return 'extreme-landscape';
  if (ratio <= 1 / 3) return 'extreme-portrait';
  if (ratio > 1.05) return 'landscape';
  if (ratio < 0.95) return 'portrait';
  return 'square';
}

export function normalizeFocalPoint(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

export function CharacterImage({
  fileId,
  alt,
  focalX = 50,
  focalY = 50,
  fallback,
  className,
  onGeometry,
  previewable = false,
}: {
  readonly fileId: string | null;
  readonly alt: string;
  readonly focalX?: number;
  readonly focalY?: number;
  readonly fallback: ReactNode;
  readonly className?: string;
  readonly onGeometry?: (geometry: CharacterImageGeometry) => void;
  readonly previewable?: boolean;
}) {
  const [failedFileId, setFailedFileId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const failed = fileId !== null && failedFileId === fileId;

  useEffect(() => {
    if (!previewOpen) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [previewOpen]);

  if (!fileId || failed) return <>{fallback}</>;

  const image = (
    <img
      className={className}
      src={`/api/v1/media/${fileId}/content`}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={{
        objectFit: 'cover',
        objectPosition: `${String(normalizeFocalPoint(focalX))}% ${String(normalizeFocalPoint(focalY))}%`,
      }}
      onLoad={(event) => {
        const geometry = classifyCharacterImageGeometry(
          event.currentTarget.naturalWidth,
          event.currentTarget.naturalHeight,
        );
        if (geometry === 'invalid') setFailedFileId(fileId);
        onGeometry?.(geometry);
      }}
      onError={() => {
        setFailedFileId(fileId);
        onGeometry?.('invalid');
      }}
    />
  );

  if (!previewable) return image;

  return (
    <>
      <span
        className="avatar-preview-trigger"
        role="button"
        tabIndex={0}
        aria-label={`Открыть аватар: ${alt}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPreviewOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            setPreviewOpen(true);
          }
        }}
      >
        {image}
      </span>
      {previewOpen
        ? createPortal(
            <div
              className="avatar-preview-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label={`Аватар: ${alt}`}
              onClick={() => {
                setPreviewOpen(false);
              }}
            >
              <button
                className="avatar-preview-close"
                type="button"
                aria-label="Закрыть"
                onClick={() => {
                  setPreviewOpen(false);
                }}
              >
                ×
              </button>
              <img
                className="avatar-preview-image"
                src={`/api/v1/media/${fileId}/content`}
                alt={alt}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
