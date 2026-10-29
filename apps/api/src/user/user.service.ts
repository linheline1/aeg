import { Injectable, Inject } from '@nestjs/common';
import { AuditRepo } from '../common/mock-db';

@Injectable()
export class UserService {
  constructor(@Inject('UserRepo') private readonly repo: any) {}
  async findById(id: string) { return this.repo.findOne({ where: { id } }); }
  async findByUsername(username: string) { return this.repo.findOne({ where: { username } }); }
}
