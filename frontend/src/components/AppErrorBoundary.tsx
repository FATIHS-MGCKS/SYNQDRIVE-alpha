import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translateKey } from '../i18n/LanguageContext';
import { resolveInitialPlatformLocale } from '../i18n/locales';

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

    const locale = resolveInitialPlatformLocale();
    const { errorMessage, errorStack, showStack } = this.state;
    const title =
      this.props.title ?? translateKey(locale, 'shell.errorBoundary.title').text;
    const description =
      this.props.description ?? translateKey(locale, 'shell.errorBoundary.description').text;

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
        <div className="max-w-lg w-full rounded-xl border border-border surface-premium p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>

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
                {showStack
                  ? translateKey(locale, 'shell.errorBoundary.hideStack').text
                  : translateKey(locale, 'shell.errorBoundary.showStack').text}
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
            {translateKey(locale, 'shell.errorBoundary.reload').text}
          </button>
        </div>
      </div>
    );
  }
}
