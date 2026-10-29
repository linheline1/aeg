import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { AuditRepo } from '../common/mock-db';

@Injectable()
export class AuditService {
  constructor(@Inject('AuditRepo') private readonly repo: any) {}

  async log(action: string, ref?: any, payload?: any, user_id?: string) {
    await this.repo.log(action, { ...ref, payload }, user_id);
  }
}
