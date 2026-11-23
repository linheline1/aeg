import type { AxiosInstance } from 'axios';
import { useEffect, useRef, useState } from 'react';

export interface QuoteTask<Result = unknown, Row = unknown> {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'partial' | 'failed' | 'stale';
  total: number;
  completed: number;
  failed: number;
  error?: { code: string; message: string };
  failures?: Array<{ row_no: number; code: string; message: string }>;
  result?: Result;
  inputRows?: Row[];
  currency?: 'USD' | 'RMB';
  expiresAt?: string;
  filename?: string;
}

export const taskActive = (task?: QuoteTask | null) => task?.status === 'queued' || task?.status === 'running';
export const taskRetryable = (task?: QuoteTask | null) => task?.status === 'partial' || task?.status === 'failed';

function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, 2000);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export async function waitForQuoteTask<T, Row>(
  api: AxiosInstance, path: string, initial: QuoteTask<T, Row>, signal: AbortSignal,
  onProgress: (task: QuoteTask<T, Row>) => void
) {
  let task = initial;
  onProgress(task);
  let transientFailures = 0;
  while (taskActive(task)) {
    await delay(signal);
    try {
      const { data } = await api.get<QuoteTask<T, Row> | null>(path, { signal });
      if (!data || data.id !== initial.id) throw new Error('Analysis was replaced. Reopen the page to load the current task.');
      task = data;
      transientFailures = 0;
      onProgress(task);
    } catch (error: any) {
      if (signal.aborted || !error?.isAxiosError || (error.response && error.response.status < 500) || ++transientFailures >= 8) throw error;
    }
  }
  return task;
}

export function readSavedDraft(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function rememberDraft(key: string, id?: string) {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch { /* storage is optional in private contexts */ }
}

export function useDiTask<T>(api: AxiosInstance, path: string | null, onComplete: (result: T) => void, onError: (error: unknown) => void) {
  const [task, setTask] = useState<QuoteTask<T> | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const callbacks = useRef({ onComplete, onError });
  callbacks.current = { onComplete, onError };

  const execute = async (url: string, method: 'get' | 'post', body?: unknown) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    if (method === 'post') setBusy(true);
    try {
      const response = method === 'get'
        ? await api.get<QuoteTask<T> | null>(url, { signal })
        : await api.post<QuoteTask<T> | null>(url, body, { signal });
      if (signal.aborted) return;
      setTask(response.data);
      if (!response.data) return;
      if (!taskActive(response.data) && method === 'get') {
        if (response.data.status === 'complete' && response.data.result) callbacks.current.onComplete(response.data.result);
        return;
      }
      setBusy(true);
      const final = await waitForQuoteTask(api, path!, response.data, signal, setTask);
      if (!signal.aborted && final.status === 'complete' && final.result) callbacks.current.onComplete(final.result);
    } catch (error) {
      if (!signal.aborted) callbacks.current.onError(error);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  useEffect(() => {
    setTask(null);
    setBusy(false);
    if (path) void execute(path, 'get');
    return () => request.current?.abort();
  }, [api, path]);

  return {
    task, busy,
    start: (body: unknown) => path && execute(path, 'post', body),
    retry: () => path && execute(path + '/retry', 'post')
  };
}

export function useNcmTask<Result, Row>(options: {
  api: AxiosInstance;
  prefix: string;
  storageKey: string;
  onRestore: (draftId: string, task: QuoteTask<Result, Row>) => void;
  onResult: (task: QuoteTask<Result, Row>) => void;
  onError: (error: unknown) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { api, prefix, storageKey } = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  const request = useRef<AbortController | null>(null);
  const [task, setTask] = useState<QuoteTask<Result, Row> | null>(null);
  const run = async (id: string, rows?: Row[], currency?: string) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const url = prefix + '/' + encodeURIComponent(id) + '/ncm-task';
    callbacks.current.onBusy(true);
    setTask(null);
    if (rows) rememberDraft(storageKey, id);
    try {
      const { data } = rows
        ? await api.post<QuoteTask<Result, Row>>(url, { rows, currency }, { signal })
        : await api.get<QuoteTask<Result, Row> | null>(url, { signal });
      if (signal.aborted) return;
      if (!data) { rememberDraft(storageKey); return; }
      if (!rows) callbacks.current.onRestore(id, data);
      const finished = await waitForQuoteTask(api, url, data, signal, setTask);
      if (!signal.aborted) callbacks.current.onResult(finished);
    } catch (error: any) {
      if (signal.aborted) return;
      if (error?.response?.status === 404) rememberDraft(storageKey);
      callbacks.current.onError(error);
    } finally {
      if (request.current === controller) {
        request.current = null;
        callbacks.current.onBusy(false);
      }
    }
  };
  useEffect(() => {
    const id = readSavedDraft(storageKey);
    if (id) void run(id);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [api, prefix, storageKey]);

  return { task, run, clear: () => { rememberDraft(storageKey); setTask(null); } };
}
