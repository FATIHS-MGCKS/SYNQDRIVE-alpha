import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
  errorStack: string | null;
  showStack: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
    errorStack: null,
    showStack: false,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'Unknown error',
      errorStack: error?.stack ?? null,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary] Render crash captured', {
      error,
      componentStack: info.componentStack,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private toggleStack = (): void => {
    this.setState((s) => ({ showStack: !s.showStack }));
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { errorMessage, errorStack, showStack } = this.state;

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
        <div className="max-w-lg w-full rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">
            {this.props.title ?? 'Something went wrong'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.props.description ??
              'A runtime error interrupted this view. Reload to recover and try again.'}
          </p>

          {errorMessage && (
            <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="text-xs font-mono font-semibold text-red-500 break-all">
                {errorMessage}
              </p>
            </div>
          )}

          {errorStack && (
            <div className="mt-2">
              <button
                type="button"
                onClick={this.toggleStack}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {showStack ? 'Hide stack trace' : 'Show stack trace'}
              </button>
              {showStack && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-muted/50 p-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                  {errorStack}
                </pre>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            className="mt-4 inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
