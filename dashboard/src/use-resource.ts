import { useCallback, useEffect, useRef, useState } from "react";

export type Resource<T> = {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
};

export function useResource<T>(load: () => Promise<T>, deps: unknown[]): Resource<T> {
  const [state, setState] = useState<Omit<Resource<T>, "reload">>({ loading: true });
  const latest = useRef(0);

  const reload = useCallback(() => {
    const request = ++latest.current;
    setState((previous) => ({ ...previous, loading: true }));
    load().then(
      (data) => request === latest.current && setState({ data, loading: false }),
      (error: unknown) => request === latest.current && setState({ error: errorMessage(error), loading: false }),
    );
  }, deps);

  useEffect(reload, [reload]);
  return { ...state, reload };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "something went wrong";
}
