import { Component, type ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly retryLabel: string;
  readonly onRetry?: () => void;
}

interface State {
  readonly failed: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  public override state: State = { failed: false };

  public static getDerivedStateFromError(): State {
    return { failed: true };
  }

  public override componentDidCatch(): void {
    // React errors may contain rendered private values; keep this diagnostic content-free.
    console.error(
      JSON.stringify({ level: 'error', event: 'web_error_boundary', component: 'root' }),
    );
  }

  public override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorRecoveryScreen
        {...this.props}
        onRetry={() => {
          this.retry();
        }}
      />
    );
  }

  private retry(): void {
    if (this.props.onRetry) {
      this.props.onRetry();
      this.setState({ failed: false });
      return;
    }
    window.location.reload();
  }
}

export function ErrorRecoveryScreen({
  title,
  description,
  retryLabel,
  onRetry,
}: Pick<Props, 'title' | 'description' | 'retryLabel' | 'onRetry'>) {
  return (
    <main className="app-shell landing-shell recovery-shell">
      <section className="error-panel root-error-panel" role="alert">
        <span className="brand-mark" aria-hidden="true">
          V
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
        <button className="primary" type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      </section>
    </main>
  );
}
