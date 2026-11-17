export function captchaErrorMessage(error: unknown, translate: (key: string) => string): string | null {
  const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
  if (code === 'CAPTCHA_REQUIRED') return translate('login.captchaRequired');
  if (code === 'CAPTCHA_FAILED') return translate('login.captchaFailed');
  if (code === 'CAPTCHA_UNAVAILABLE') return translate('login.captchaUnavailable');
  return null;
}
