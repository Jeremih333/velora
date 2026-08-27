import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AppErrorBoundary, ErrorRecoveryScreen } from './AppErrorBoundary';

it('provides a localized recovery screen after a render failure', () => {
  expect(AppErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true });
  const markup = renderToStaticMarkup(
    <ErrorRecoveryScreen
      title="Не удалось открыть раздел"
      description="Перезагрузи приложение."
      retryLabel="Повторить"
    />,
  );
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('Не удалось открыть раздел');
  expect(markup).toContain('Повторить');
});
