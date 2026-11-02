/** Shared result and paging types of the repositories. */

export interface Page<T> {
  items: T[];
  total: number;
}

export interface Paging {
  offset?: number;
  limit?: number;
}
