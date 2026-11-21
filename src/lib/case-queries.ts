import { QueryClient, type InvalidateQueryFilters, type InvalidateOptions } from "@tanstack/react-query";

export const CASE_QUERY_ROOTS = ["cases", "case-detail", "case-wv", "alle-case-nummers", "url-index", "stations", "station"];
export const invalidateCaseQueries = (qc: QueryClient) => qc.invalidateQueries({ predicate: q => CASE_QUERY_ROOTS.includes(String(q.queryKey[0])) });

/** Expand even when the originally invalidated overview was never mounted. */
export class CaseQueryClient extends QueryClient {
  override invalidateQueries(filters?: InvalidateQueryFilters, options?: InvalidateOptions) {
    if (filters?.queryKey && CASE_QUERY_ROOTS.includes(String(filters.queryKey[0]))) return super.invalidateQueries({ predicate: q => CASE_QUERY_ROOTS.includes(String(q.queryKey[0])) }, options);
    return super.invalidateQueries(filters, options);
  }
}

/** Existing mutation paths invalidate these roots; fan out without an invalidation loop. */
export function verbindCaseInvalidatie(qc: QueryClient) {
  return qc.getQueryCache().subscribe(event => {
    if (event.type !== "updated" || event.action.type !== "invalidate" || !CASE_QUERY_ROOTS.includes(String(event.query.queryKey[0]))) return;
    void qc.invalidateQueries({ predicate: q => q !== event.query && !q.state.isInvalidated && CASE_QUERY_ROOTS.includes(String(q.queryKey[0])) });
  });
}