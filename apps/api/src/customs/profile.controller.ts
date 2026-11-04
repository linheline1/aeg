import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { AuditRepo, UserRepo } from '../common/mock-db';
import { changeSelfPassword, getSelfProfile } from '../common/self-profile';

/** 清关行（葡语端口）自助：账户信息 + 修改本人密码 */
@Controller('customs/profile')
@UseGuards(AuthGuard, RolesGuard)
@Roles('customs')
export class CustomsProfileController {
  constructor(
    @Inject('UserRepo') private readonly userRepo: UserRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  @Get()
  get(@Req() req: Request & { user?: any }) {
    return getSelfProfile(this.userRepo, req.user?.sub);
  }

  @Patch('password')
  changePassword(
    @Body() body: { current_password?: string; new_password?: string },
    @Req() req: Request & { user?: any }
  ) {
    return changeSelfPassword(this.userRepo, this.auditRepo, req.user?.sub, body);
  }
}
