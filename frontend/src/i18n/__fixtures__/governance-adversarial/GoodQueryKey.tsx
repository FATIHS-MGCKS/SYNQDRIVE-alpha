/** Negative fixture: query/cache key */
export function GoodQueryKey() {
  const queryKey = ['vehicles', 'list', 'org-123'];
  return <span data-key={queryKey.join(':')}>X</span>;
}
