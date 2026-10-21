export type DurableReadResult<T> =
  | { status: 'FOUND'; value: T }
  | { status: 'MISSING' }
  | { status: 'READ_ERROR'; error: string };
