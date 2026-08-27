import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';
import { prepareImageUpload } from './image-upload';
import { useI18n } from './i18n';
import type { MediaFile, MediaLibraryResponse } from './types';

const copy = {
  ru: {
    title: 'Загрузить изображение',
    choose: 'Выбрать из галереи или файлов',
    horizontal: 'Фокус по горизонтали',
    vertical: 'Фокус по вертикали',
    upload: 'Обрезать и загрузить',
    uploading: 'Обрабатываем и загружаем…',
    fallback:
      'Прямая загрузка пока недоступна. Отправь изображение в чат с ботом — оно появится в медиатеке.',
    failed: 'Не удалось обработать изображение. Проверь формат и размер файла.',
    selected: 'Выбрано',
    generateTitle: 'Создать аватар',
    generatePrompt: 'Опиши внешность и стиль персонажа',
    generate: 'Сгенерировать',
    generating: 'Создаём аватар…',
    generatedName: 'Сгенерированный аватар',
  },
  en: {
    title: 'Upload image',
    choose: 'Choose from gallery or files',
    horizontal: 'Horizontal focus',
    vertical: 'Vertical focus',
    upload: 'Crop and upload',
    uploading: 'Processing and uploading…',
    fallback:
      'Direct upload is not available yet. Send the image to the bot and it will appear in your media library.',
    failed: 'The image could not be processed. Check its format and size.',
    selected: 'Selected',
    generateTitle: 'Generate avatar',
    generatePrompt: 'Describe the character appearance and style',
    generate: 'Generate',
    generating: 'Generating avatar…',
    generatedName: 'Generated avatar',
  },
} as const;

export function ImageUploadControl({
  capabilities,
  onUploaded,
  aspectRatio = 8 / 5,
}: {
  readonly capabilities: MediaLibraryResponse['capabilities'] | undefined;
  readonly onUploaded: (media: MediaFile) => void;
  readonly aspectRatio?: number;
}) {
  const { locale } = useI18n();
  const labels = copy[locale];
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [pending, setPending] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (capabilities && !capabilities.directUpload) {
    return <p className="media-upload-fallback">{labels.fallback}</p>;
  }

  const upload = async () => {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const prepared = await prepareImageUpload(file, { focalX, focalY, aspectRatio });
      const uploaded = await apiRequest<MediaFile>('/api/v1/media', {
        method: 'POST',
        headers: {
          'content-type': prepared.blob.type,
          'x-upload-name': encodeURIComponent(file.name),
        },
        body: prepared.blob,
      });
      await client.invalidateQueries({ queryKey: ['media'] });
      onUploaded(uploaded);
      setFile(null);
      setPreviewUrl(null);
    } catch {
      setError(labels.failed);
    } finally {
      setPending(false);
    }
  };

  const generate = async () => {
    const prompt = generationPrompt.trim();
    if (prompt.length < 3) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await apiRequest<{
        readonly mimeType: 'image/jpeg';
        readonly imageBase64: string;
      }>('/api/v1/media/generate-avatar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const binary = atob(result.imageBase64);
      const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
      const uploaded = await apiRequest<MediaFile>('/api/v1/media', {
        method: 'POST',
        headers: {
          'content-type': result.mimeType,
          'x-upload-name': encodeURIComponent(`${labels.generatedName}.jpg`),
        },
        body: new Blob([bytes], { type: result.mimeType }),
      });
      await client.invalidateQueries({ queryKey: ['media'] });
      onUploaded(uploaded);
      setGenerationPrompt('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.failed);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="media-upload" aria-labelledby="media-upload-title">
      <strong id="media-upload-title">{labels.title}</strong>
      <div className="media-upload-actions">
        <details className="media-avatar-generator">
          <summary>{labels.generateTitle}</summary>
          <label>
            <span className="visually-hidden">{labels.generatePrompt}</span>
            <textarea
              value={generationPrompt}
              maxLength={600}
              placeholder={labels.generatePrompt}
              disabled={generating || capabilities === undefined}
              onChange={(event) => {
                setGenerationPrompt(event.currentTarget.value);
              }}
            />
          </label>
          <button
            className="secondary"
            type="button"
            disabled={generating || generationPrompt.trim().length < 3}
            onClick={() => void generate()}
          >
            {generating ? labels.generating : labels.generate}
          </button>
        </details>
        <label className="secondary media-upload-picker">
          {labels.choose}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending || capabilities === undefined}
            onChange={(event) => {
              const selected = event.currentTarget.files?.item(0) ?? null;
              setFile(selected);
              setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
              setError(null);
            }}
          />
        </label>
      </div>
      {file && previewUrl ? (
        <>
          <div className="media-upload-preview" style={{ aspectRatio: String(aspectRatio) }}>
            <img
              src={previewUrl}
              alt={`${labels.selected}: ${file.name}`}
              style={{ objectPosition: `${String(focalX)}% ${String(focalY)}%` }}
            />
          </div>
          <label className="media-upload-slider">
            <span>{labels.horizontal}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={focalX}
              onChange={(event) => {
                setFocalX(Number(event.currentTarget.value));
              }}
            />
          </label>
          <label className="media-upload-slider">
            <span>{labels.vertical}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={focalY}
              onChange={(event) => {
                setFocalY(Number(event.currentTarget.value));
              }}
            />
          </label>
          <button
            className="primary media-upload-submit"
            type="button"
            disabled={pending}
            onClick={() => void upload()}
          >
            {pending ? labels.uploading : labels.upload}
          </button>
        </>
      ) : null}
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
