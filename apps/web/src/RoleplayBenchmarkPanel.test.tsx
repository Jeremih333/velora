// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';
import type * as ApiModule from './api';
import { I18nProvider } from './i18n';
import { RoleplayBenchmarkPanel } from './RoleplayBenchmarkPanel';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);

afterEach(() => {
  cleanup();
  mockedApiRequest.mockReset();
});

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="ru">
        <RoleplayBenchmarkPanel
          models={[
            {
              modelProfileId: 'velora-free-roleplay',
              displayName: 'Lunaris Roleplay',
              providerModelId: 'l3-lunaris-8b',
              tier: 'free',
              enabled: true,
            },
          ]}
          capabilities={{
            availableCandidates: ['l3-lunaris-8b'],
            selectedModel: 'l3-lunaris-8b',
            checkedAt: 1,
          }}
          notify={vi.fn()}
        />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('RoleplayBenchmarkPanel', () => {
  it('requires an explicit seven-request confirmation before starting', async () => {
    mockedApiRequest.mockResolvedValueOnce({ items: [] });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Запустить RP-бенчмарк' }));

    expect(screen.getByRole('heading', { name: 'Потратить семь запросов?' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Потратить 7 запросов' })).not.toBeNull();
    expect(mockedApiRequest).toHaveBeenCalledTimes(1);
  });

  it('does not permit an unseen review after transient samples are gone', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      items: [
        {
          runKey: 'BOTHUB_RP_BENCH_V1_velora-free-roleplay',
          benchmarkVersion: 'V1',
          modelProfileId: 'velora-free-roleplay',
          providerModelId: 'l3-lunaris-8b',
          state: 'AWAITING_REVIEW',
          scenarioCount: 7,
          completedScenarioCount: 7,
          inputTokens: 100,
          outputTokens: 100,
          conservativeCostMicros: 1,
          latencyMs: 10,
          errorCode: null,
          startedAt: 1,
          completedAt: 2,
          reviewedAt: null,
          alreadyAttempted: true,
        },
      ],
    });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/временные ответы уже закрыты/u)).not.toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Одобрить модель' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Отклонить модель' })).toBeNull();
  });

  it('shows all transient samples and submits every score exactly once', async () => {
    const samples = Array.from({ length: 7 }, (_, index) => ({
      scenarioId: `scenario-${String(index + 1)}`,
      output: `Ролевой ответ для проверки номер ${String(index + 1)}.`,
      outputSha256: 'a'.repeat(64),
      outputLength: 40,
      inputTokens: 20,
      outputTokens: 12,
      conservativeCostMicros: 20_000,
      latencyMs: 100,
    }));
    const run = {
      runKey: 'BOTHUB_RP_BENCH_V1_velora-free-roleplay',
      benchmarkVersion: 'V1',
      modelProfileId: 'velora-free-roleplay',
      providerModelId: 'l3-lunaris-8b',
      state: 'AWAITING_REVIEW' as const,
      scenarioCount: 7,
      completedScenarioCount: 7,
      inputTokens: 140,
      outputTokens: 84,
      conservativeCostMicros: 140_000,
      latencyMs: 700,
      errorCode: null,
      startedAt: 1,
      completedAt: 2,
      reviewedAt: null,
      alreadyAttempted: false,
      samples,
    };
    mockedApiRequest
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ run })
      .mockResolvedValueOnce({ items: [run] })
      .mockResolvedValueOnce({ run: { ...run, state: 'APPROVED', samples: undefined } })
      .mockResolvedValueOnce({ items: [{ ...run, state: 'APPROVED', samples: undefined }] });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Запустить RP-бенчмарк' }));
    fireEvent.click(screen.getByRole('button', { name: 'Потратить 7 запросов' }));

    expect(await screen.findByText('Ролевой ответ для проверки номер 7.')).not.toBeNull();
    const scoreInputs = screen.getAllByRole('combobox');
    expect(scoreInputs).toHaveLength(14);
    const firstScore = scoreInputs[0];
    if (!firstScore) throw new Error('The first benchmark score input is missing.');
    fireEvent.change(firstScore, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Одобрить модель' }));

    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledTimes(5);
    });
    const reviewCall = mockedApiRequest.mock.calls[3];
    expect(reviewCall?.[0]).toContain('/review');
    const rawReviewBody = reviewCall?.[1]?.body;
    if (typeof rawReviewBody !== 'string') throw new Error('Benchmark review body is missing.');
    const reviewBody = JSON.parse(rawReviewBody) as {
      readonly decision: string;
      readonly scores: Readonly<Record<string, number>>;
    };
    expect(reviewBody.decision).toBe('APPROVED');
    expect(Object.keys(reviewBody.scores)).toHaveLength(14);
    expect(reviewBody.scores['character_adherence']).toBe(5);
  });
});
