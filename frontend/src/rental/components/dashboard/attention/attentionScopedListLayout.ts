/** Collapsed dashboard notification rows shown before bottom scroll blur appears. */
export const ATTENTION_SCOPED_LIST_VISIBLE_ENTRIES = 5;

/**
 * Scroll viewport for attention lists: ~5 notification rows + list padding.
 * Row height matches compact NotificationEntryCard rhythm (py-2.5 + summary).
 */
export const ATTENTION_SCOPED_LIST_SCROLL_MAX_HEIGHT_CLASS =
  'max-h-[calc(4.25rem*5+0.5rem*4+1rem)]';
