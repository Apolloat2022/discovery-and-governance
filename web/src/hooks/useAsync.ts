import { useCallback, useEffect, useState } from "react";
import { ApiUnreachableError } from "../api/client";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  apiDown: boolean;
  reload: () => void;
}

/**
 * Runs `fn` whenever `deps` change and exposes loading/error/apiDown state.
 * Unreachable-API failures are distinguished from ordinary errors so pages can
 * show a "start the server" message instead of a generic error string.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setApiDown(false);

    fn()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiUnreachableError) {
          setApiDown(true);
        } else {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, apiDown, reload };
}
