import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

const TEST_SITEKEY = '10000000-ffff-ffff-ffff-000000000001';
const TEST_SECRET = '0x0000000000000000000000000000000000000000';

@Injectable()
export class LoginCaptchaService {
  async verify(token: string): Promise<void> {
    if (typeof token !== 'string' || !token || token.length > 4096) {
      throw new UnauthorizedException({ code: 'CAPTCHA_REQUIRED', message: '请先完成人机验证' });
    }
    const production = process.env.NODE_ENV === 'production';
    const testMode = !production && process.env.HCAPTCHA_TEST_MODE === 'true';
    const secret = process.env.HCAPTCHA_SECRET || (testMode ? TEST_SECRET : '');
    const sitekey = process.env.HCAPTCHA_SITEKEY || (testMode ? TEST_SITEKEY : '');
    if (!secret || !sitekey || (production && (secret === TEST_SECRET || sitekey === TEST_SITEKEY))) {
      throw new ServiceUnavailableException({ code: 'CAPTCHA_UNAVAILABLE', message: '人机验证尚未配置' });
    }
    const body = new URLSearchParams({ secret, response: token, sitekey });
    let result: { success?: boolean };
    try {
      const response = await fetch('https://api.hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error('hCaptcha unavailable');
      result = await response.json() as { success?: boolean };
    } catch {
      throw new ServiceUnavailableException({ code: 'CAPTCHA_UNAVAILABLE', message: '人机验证服务暂不可用，请稍后重试' });
    }
    if (result.success !== true) throw new UnauthorizedException({ code: 'CAPTCHA_FAILED', message: '人机验证未通过或已过期，请重试' });
  }
}
