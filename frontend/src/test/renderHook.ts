// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

interface RenderHookOptions<TProps> {
  initialProps?: TProps;
}

export function renderHook<TResult, TProps = void>(
  hook: (props: TProps) => TResult,
  options: RenderHookOptions<TProps> = {},
) {
  const bag: { current: TResult | undefined } = { current: undefined };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let props = options.initialProps as TProps;

  function Harness() {
    bag.current = hook(props);
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    result: bag as { current: TResult },
    rerender: (nextProps: TProps) =>
      act(() => {
        props = nextProps;
        root.render(createElement(Harness));
      }),
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
}

export async function waitForHook(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 20,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('waitForHook timeout');
}
