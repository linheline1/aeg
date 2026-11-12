import { BadRequestException, Body, Controller, Get, Inject, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post('avatar')
  @Roles('sales')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: 256 * 1024, files: 1 } }))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Req() req: SelfRequest) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('头像仅支持 PNG、JPG 或 WebP，且不超过 256 KB');
    }
    const valid = file.mimetype === 'image/png' ? file.buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : file.mimetype === 'image/jpeg' ? file.buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
      : file.buffer.toString('ascii', 0, 4) === 'RIFF' && file.buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new BadRequestException('图片内容与文件类型不符');
    const user = await this.userRepo.update(req.user.sub, {
      avatar_data: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
    });
    if (!user) throw new BadRequestException('账户不存在');
    return { avatar_data: user.avatar_data };
  }

  @Patch('contact')
  @Roles('sales')
  async updateContact(@Body() body: { phone?: string; wechat?: string }, @Req() req: SelfRequest) {
    const phone = String(body.phone || '').trim();
    const wechat = String(body.wechat || '').trim();
    if (phone.length > 30 || (phone && !/^\+?[0-9 ()-]{6,30}$/.test(phone))) {
      throw new BadRequestException('电话号码格式不正确');
    }
    if (wechat.length > 80 || (wechat && !/^[a-zA-Z0-9_-]{5,80}$/.test(wechat))) {
      throw new BadRequestException('微信号格式不正确');
    }
    const user = await this.userRepo.update(req.user.sub, { sales_phone: phone || null, sales_wechat: wechat || null });
    if (!user) throw new BadRequestException('账户不存在');
    return { phone: user.sales_phone || null, wechat: user.sales_wechat || null };
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
