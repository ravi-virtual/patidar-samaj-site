import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../api/axiosInstance';

interface Result<T> {
  token: string;
  data?: T;
  error?: string;
}

/**
 * Loads data for a page. `key` identifies the request (include every filter in it); when it changes
 * the new request starts and `loading` is true until it answers. The previous data stays available
 * meanwhile so lists do not flash empty while a filter is typed. Out-of-date answers are ignored.
 */
export function useFetch<T>(key: string, fetcher: () => Promise<T>) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const token = `${key}#${attempt}`;

  useEffect(() => {
    let cancelled = false;
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setResult({ token, data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult((prev) => ({ token, data: prev?.data, error: getErrorMessage(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const settled = result?.token === token;
  return {
    data: result?.data,
    error: settled ? result?.error : undefined,
    loading: !settled,
    /** True only for the very first load (no data to show yet). */
    initialLoading: !settled && result?.data === undefined,
    retry: () => setAttempt((n) => n + 1),
  };
}
