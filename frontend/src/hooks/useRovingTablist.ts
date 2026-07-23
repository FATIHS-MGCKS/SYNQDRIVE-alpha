import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefCallback } from 'react';

export interface RovingTablistOptions<T extends string> {
  items: readonly T[];
  activeId: T;
  onActivate: (id: T) => void;
  getItemId: (id: T) => string;
  getPanelId: (id: T) => string;
  orientation?: 'horizontal' | 'vertical';
}

export function useRovingTablist<T extends string>({
  items,
  activeId,
  onActivate,
  getItemId,
  getPanelId,
  orientation = 'horizontal',
}: RovingTablistOptions<T>) {
  const tabRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(0, items.indexOf(activeId)));

  useEffect(() => {
    const idx = items.indexOf(activeId);
    if (idx >= 0) setFocusedIndex(idx);
  }, [activeId, items]);

  const focusTabAt = useCallback(
    (index: number) => {
      if (items.length === 0) return;
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      setFocusedIndex(clamped);
      tabRefs.current.get(clamped)?.focus();
    },
    [items.length],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

      switch (event.key) {
        case prevKey:
          event.preventDefault();
          focusTabAt(index === 0 ? items.length - 1 : index - 1);
          break;
        case nextKey:
          event.preventDefault();
          focusTabAt(index === items.length - 1 ? 0 : index + 1);
          break;
        case 'Home':
          event.preventDefault();
          focusTabAt(0);
          break;
        case 'End':
          event.preventDefault();
          focusTabAt(items.length - 1);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          onActivate(items[index]!);
          break;
        default:
          break;
      }
    },
    [focusTabAt, items, onActivate, orientation],
  );

  const getTabProps = (id: T, index: number) => {
    const isActive = activeId === id;
    const ref: RefCallback<HTMLButtonElement> = (el) => {
      if (el) tabRefs.current.set(index, el);
      else tabRefs.current.delete(index);
    };

    return {
      id: getItemId(id),
      role: 'tab' as const,
      tabIndex: index === focusedIndex ? 0 : -1,
      'aria-selected': isActive,
      'aria-controls': getPanelId(id),
      ref,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, index),
      onFocus: () => setFocusedIndex(index),
      onClick: () => onActivate(id),
    };
  };

  return { getTabProps, focusedIndex };
}
