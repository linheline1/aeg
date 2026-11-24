import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../common/guards/auth.guard';
import type { QuotesRepo, UserRepo } from '../common/mock-db';
import { LoginCaptchaService } from '../auth/login-captcha.service';
import { notificationQuery } from '../order/notification-query';

const probeId = '00000000-0000-0000-0000-000000000000';

@Controller('readiness')
@Public()
export class ReadinessController {
  constructor(
    @Inject('UserRepo') private readonly users: UserRepo,
    @Inject('QuotesRepo') private readonly quotes: QuotesRepo,
    private readonly captcha: LoginCaptchaService,
    @Optional() private readonly db?: DataSource
  ) {}

  @Get()
  async check() {
    try {
      this.captcha.checkConfiguration();
      await Promise.all([
        this.users.findOne({ where: { id: probeId } }),
        this.quotes.findById(probeId),
        this.db?.query(`${notificationQuery} SELECT count(*)::int FROM inbox WHERE NOT read`, [probeId, probeId])
      ]);
      return { ok: true };
    } catch {
      throw new ServiceUnavailableException('Business API is not ready');
    }
  }
}
