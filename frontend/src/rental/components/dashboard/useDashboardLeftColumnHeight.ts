import { useEffect, useState, type RefObject } from 'react';

const DESKTOP_MEDIA = '(min-width: 1024px)';

/** Matches notifications column max-height to the left KPI + finance stack on desktop. */
export function useDashboardLeftColumnHeight(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
): number | undefined {
  const [height, setHeight] = useState<number | undefined>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const media = window.matchMedia(DESKTOP_MEDIA);

    const update = () => {
      if (!media.matches) {
        setHeight(undefined);
        return;
      }
      setHeight(el.getBoundingClientRect().height);
    };

    const observer = new ResizeObserver(update);
    observer.observe(el);
    media.addEventListener('change', update);
    update();

    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remeasure when left column content changes height
  }, [ref, ...deps]);

  return height;
}
