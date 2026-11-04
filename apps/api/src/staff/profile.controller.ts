import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { AuditRepo, UserRepo } from '../common/mock-db';
import { changeSelfPassword, getSelfProfile } from '../common/self-profile';

type SelfRequest = Request & { user?: any };

/** 运营端员工自助：账户信息 + 修改本人密码（报价员 / 业务员 / 管理员） */
@Controller('ops/profile')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'operator', 'sales')
export class OpsProfileController {
  constructor(
    @Inject('UserRepo') private readonly userRepo: UserRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  @Get()
  get(@Req() req: SelfRequest) {
    return getSelfProfile(this.userRepo, req.user?.sub);
  }

  @Patch('password')
  changePassword(
    @Body() body: { current_password?: string; new_password?: string },
    @Req() req: SelfRequest
  ) {
    return changeSelfPassword(this.userRepo, this.auditRepo, req.user?.sub, body);
  }
}

/** 管理端自助：管理员与负责企业认证的运营人员 */
@Controller('admin/profile')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin', 'operator')
export class AdminProfileController {
  constructor(
    @Inject('UserRepo') private readonly userRepo: UserRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  @Get()
  get(@Req() req: SelfRequest) {
    return getSelfProfile(this.userRepo, req.user?.sub);
  }

  @Patch('password')
  changePassword(
    @Body() body: { current_password?: string; new_password?: string },
    @Req() req: SelfRequest
  ) {
    return changeSelfPassword(this.userRepo, this.auditRepo, req.user?.sub, body);
  }
}
