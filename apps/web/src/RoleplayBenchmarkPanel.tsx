import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from './api';
import { Dialog } from './CoreComponents';
import { localizedErrorMessage } from './error-localization';
import { useI18n } from './i18n';
import type {
  BotHubModelCapabilities,
  RoleplayBenchmarkCriterion,
  RoleplayBenchmarkRun,
  RoleplayModelEvalCatalogItem,
} from './types';

const criteria: readonly RoleplayBenchmarkCriterion[] = [
  'character_adherence',
  'persona_adherence',
  'narrative_quality',
  'russian_quality',
  'english_quality',
  'emotional_continuity',
  'memory_use',
  'lore_use',
  'formatting',
  'repetition_control',
  'verbosity_control',
  'latency',
  'cost',
  'consensual_mature_fictional_compatibility',
];

const benchmarkCopy = {
  ru: {
    title: 'Стандартизированный RP-бенчмарк',
    description:
      'Семь коротких сценариев проверяют образ, персону, память, Lorebook, русский и английский текст. Ответы показываются только сейчас и не сохраняются.',
    run: 'Запустить RP-бенчмарк',
    confirmTitle: 'Потратить семь запросов?',
    consent:
      'Будет выполнено ровно семь ограниченных запросов без автоматических повторов. Не закрывай окно до выставления оценок.',
    confirm: 'Потратить 7 запросов',
    running: 'Выполняются 7 сценариев…',
    reviewTitle: 'Оценка результатов',
    reviewDescription:
      'Оцени каждый критерий от 1 до 5. После закрытия окна тексты восстановить нельзя.',
    approve: 'Одобрить модель',
    reject: 'Отклонить модель',
    reviewed: 'Оценка RP-бенчмарка сохранена.',
    awaiting:
      'Запуск ожидает оценки, но временные ответы уже закрыты. Не ставь оценку без просмотра.',
    criteria: {
      character_adherence: 'Соответствие образу',
      persona_adherence: 'Соответствие персоне',
      narrative_quality: 'Качество повествования',
      russian_quality: 'Качество русского языка',
      english_quality: 'Качество английского языка',
      emotional_continuity: 'Эмоциональная последовательность',
      memory_use: 'Использование памяти',
      lore_use: 'Использование Lorebook',
      formatting: 'Форматирование',
      repetition_control: 'Контроль повторов',
      verbosity_control: 'Контроль объёма',
      latency: 'Скорость ответа',
      cost: 'Экономичность',
      consensual_mature_fictional_compatibility: 'Допустимый взрослый вымышленный RP',
    },
  },
  en: {
    title: 'Standardized roleplay benchmark',
    description:
      'Seven short scenarios test character, persona, memory, lore, Russian, and English. Responses are shown only now and are not stored.',
    run: 'Run roleplay benchmark',
    confirmTitle: 'Spend seven requests?',
    consent:
      'Exactly seven bounded requests run without automatic retries. Keep this window open until scoring is complete.',
    confirm: 'Spend 7 requests',
    running: 'Running 7 scenarios…',
    reviewTitle: 'Review results',
    reviewDescription:
      'Score every criterion from 1 to 5. The samples cannot be recovered after closing this window.',
    approve: 'Approve model',
    reject: 'Reject model',
    reviewed: 'The roleplay benchmark review was saved.',
    awaiting:
      'This run awaits review, but its transient samples are no longer open. Do not score it unseen.',
    criteria: {
      character_adherence: 'Character adherence',
      persona_adherence: 'Persona adherence',
      narrative_quality: 'Narrative quality',
      russian_quality: 'Russian quality',
      english_quality: 'English quality',
      emotional_continuity: 'Emotional continuity',
      memory_use: 'Memory use',
      lore_use: 'Lore use',
      formatting: 'Formatting',
      repetition_control: 'Repetition control',
      verbosity_control: 'Verbosity control',
      latency: 'Latency',
      cost: 'Cost efficiency',
      consensual_mature_fictional_compatibility: 'Permitted consensual mature fictional RP',
    },
  },
} as const;

export function RoleplayBenchmarkPanel({
  models,
  capabilities,
  notify,
}: {
  readonly models: readonly RoleplayModelEvalCatalogItem[];
  readonly capabilities: BotHubModelCapabilities | null;
  readonly notify: (message: string | null) => void;
}) {
  const { locale, messages } = useI18n();
  const copy = benchmarkCopy[locale];
  const client = useQueryClient();
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [reviewRun, setReviewRun] = useState<RoleplayBenchmarkRun | null>(null);
  const [scores, setScores] = useState<Readonly<Record<RoleplayBenchmarkCriterion, number>>>(
    () =>
      Object.fromEntries(criteria.map((criterion) => [criterion, 3])) as Readonly<
        Record<RoleplayBenchmarkCriterion, number>
      >,
  );
  const benchmarks = useQuery({
    queryKey: ['admin-model-benchmarks'],
    queryFn: () =>
      apiRequest<{ readonly items: readonly RoleplayBenchmarkRun[] }>(
        '/api/v1/admin/operations/model-benchmarks',
      ),
  });
  const run = useMutation({
    mutationFn: (modelProfileId: string) =>
      apiRequest<{ readonly run: RoleplayBenchmarkRun }>(
        '/api/v1/admin/operations/model-benchmarks',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            modelProfileId,
            confirmation: 'ПОТРАТИТЬ 7 ЗАПРОСОВ НА RP-БЕНЧМАРК',
          }),
        },
      ),
    onSuccess: async (result) => {
      setPendingModelId(null);
      if (result.run.samples?.length) setReviewRun(result.run);
      await client.invalidateQueries({ queryKey: ['admin-model-benchmarks'] });
    },
  });
  const review = useMutation({
    mutationFn: ({
      runKey,
      decision,
    }: {
      readonly runKey: string;
      readonly decision: 'APPROVED' | 'REJECTED';
    }) =>
      apiRequest<{ readonly run: RoleplayBenchmarkRun }>(
        `/api/v1/admin/operations/model-benchmarks/${encodeURIComponent(runKey)}/review`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision, scores }),
        },
      ),
    onSuccess: async () => {
      setReviewRun(null);
      notify(copy.reviewed);
      await client.invalidateQueries({ queryKey: ['admin-model-benchmarks'] });
    },
  });
  const runsByProfile = new Map(
    (benchmarks.data?.items ?? []).map((item) => [item.modelProfileId, item] as const),
  );
  const error = benchmarks.error ?? run.error ?? review.error;
  return (
    <section className="roleplay-benchmark-panel" aria-labelledby="roleplay-benchmark-title">
      <div>
        <h3 id="roleplay-benchmark-title">{copy.title}</h3>
        <p className="section-description">{copy.description}</p>
      </div>
      <div className="model-eval-list">
        {models.map((model) => {
          const result = runsByProfile.get(model.modelProfileId);
          const available =
            capabilities?.availableCandidates.includes(model.providerModelId) ?? false;
          return (
            <article className="model-eval-card" key={model.modelProfileId}>
              <div className="model-eval-heading">
                <span>
                  <strong>{model.displayName}</strong>
                  <small>{model.providerModelId}</small>
                </span>
                {result ? <span className="status-pill">{result.state}</span> : null}
              </div>
              {result?.state === 'AWAITING_REVIEW' ? (
                <p className="section-description">{copy.awaiting}</p>
              ) : null}
              {!result ? (
                <button
                  type="button"
                  disabled={!available || run.isPending}
                  onClick={() => {
                    setPendingModelId(model.modelProfileId);
                  }}
                >
                  {copy.run}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      {pendingModelId ? (
        <Dialog
          backdropClassName="account-dialog-backdrop"
          className="account-dialog"
          labelledBy="roleplay-benchmark-confirm-title"
          onClose={() => {
            setPendingModelId(null);
          }}
        >
          <h3 id="roleplay-benchmark-confirm-title">{copy.confirmTitle}</h3>
          <p>{copy.consent}</p>
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => {
                setPendingModelId(null);
              }}
            >
              {messages.common.cancel}
            </button>
            <button
              type="button"
              className="compact-primary"
              disabled={run.isPending}
              onClick={() => {
                run.mutate(pendingModelId);
              }}
            >
              {run.isPending ? copy.running : copy.confirm}
            </button>
          </div>
        </Dialog>
      ) : null}
      {reviewRun?.samples?.length ? (
        <Dialog
          backdropClassName="account-dialog-backdrop"
          className="account-dialog benchmark-review-dialog"
          labelledBy="roleplay-benchmark-review-title"
          onClose={() => undefined}
        >
          <h3 id="roleplay-benchmark-review-title">{copy.reviewTitle}</h3>
          <p>{copy.reviewDescription}</p>
          <div className="benchmark-samples">
            {reviewRun.samples.map((sample) => (
              <article key={sample.scenarioId}>
                <strong>{sample.scenarioId}</strong>
                <p>{sample.output}</p>
                <small>
                  {messages.aiAdmin.tokenUsage(sample.inputTokens, sample.outputTokens)} ·{' '}
                  {sample.latencyMs} {messages.aiAdmin.milliseconds}
                </small>
              </article>
            ))}
          </div>
          <div className="benchmark-score-grid">
            {criteria.map((criterion) => (
              <label key={criterion}>
                <span>{copy.criteria[criterion]}</span>
                <select
                  value={scores[criterion]}
                  onChange={(event) => {
                    const score = Number(event.currentTarget.value);
                    setScores((current) => ({
                      ...current,
                      [criterion]: score,
                    }));
                  }}
                >
                  {[1, 2, 3, 4, 5].map((score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="dialog-actions">
            <button
              type="button"
              disabled={review.isPending}
              onClick={() => {
                review.mutate({ runKey: reviewRun.runKey, decision: 'REJECTED' });
              }}
            >
              {copy.reject}
            </button>
            <button
              type="button"
              className="compact-primary"
              disabled={review.isPending}
              onClick={() => {
                review.mutate({ runKey: reviewRun.runKey, decision: 'APPROVED' });
              }}
            >
              {copy.approve}
            </button>
          </div>
        </Dialog>
      ) : null}
      {error ? <p className="error">{localizedErrorMessage(error, messages)}</p> : null}
    </section>
  );
}
