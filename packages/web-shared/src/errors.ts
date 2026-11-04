import axios from 'axios';

export function getApiErrorMessage(error: unknown, fallback = '操作失败') {
  if (axios.isAxiosError<{ message?: unknown }>(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message)) return message.join('；');
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
