import {
  BadRequestException, Body, Controller, Get, Inject, NotFoundException, Patch, Post,
  Req, Res, UploadedFile, UseGuards, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { assertValidPassword } from '../common/password-policy';
import { AuditRepo, ClientRepo, UserRepo, repoRoot } from '../common/mock-db';
import { decodeLicenseFileName, LICENSE_DIR, licenseUploadOptions } from '../common/license-upload';

@Controller('client/profile')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
export class ProfileController {
  constructor(
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('UserRepo') private readonly userRepo: UserRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  @Get()
  async get(@Req() req: Request & { user?: any }) {
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');
    const client: any = await this.clientRepo.findOne({ where: { id: clientId } });
    const user: any = await this.userRepo.findOne({ where: { id: req.user?.sub } });
    if (!client || !user) throw new NotFoundException('账户资料不存在');
    return {
      id: user.id,
      username: user.username,
      status: user.status,
      created_at: user.created_at,
      client: {
        id: client.id,
        name: client.name,
        china_company_name: client.china_company_name || null,
        china_uscc: client.china_uscc || null,
        verification_status: client.verification_status || 'approved',
        verification_note: client.verification_note || null,
        verified_by: client.verified_by || null,
        verified_at: client.verified_at || null,
        license_uploaded: !!client.license_file_path,
        license_file_name: client.license_file_name || null,
        license_mime_type: client.license_mime_type || null,
        license_size_bytes: client.license_size_bytes || null
      }
    };
  }

  @Get('license')
  async license(@Req() req: Request & { user?: any }, @Res() res: Response) {
    const client: any = await this.clientRepo.findOne({ where: { id: req.user?.client_id } });
    if (!client?.license_file_path) throw new NotFoundException('尚未上传营业执照');
    const filePath = path.resolve(repoRoot(), client.license_file_path);
    if (!filePath.startsWith(LICENSE_DIR + path.sep) || !fs.existsSync(filePath)) {
      throw new NotFoundException('营业执照文件不存在');
    }
    res.setHeader('Content-Type', client.license_mime_type || 'application/octet-stream');
    return res.sendFile(filePath);
  }

  @Patch('password')
  async changePassword(
    @Body() body: { current_password?: string; new_password?: string },
    @Req() req: Request & { user?: any }
  ) {
    const user: any = await this.userRepo.findOne({ where: { id: req.user?.sub } });
    if (!user) throw new NotFoundException('账户不存在');
    if (!body.current_password || !await bcrypt.compare(body.current_password, user.password_hash)) {
      throw new BadRequestException('当前密码不正确');
    }
    const password = body.new_password || '';
    assertValidPassword(password, '新密码');
    await this.userRepo.update(user.id, { password_hash: await bcrypt.hash(password, 12) });
    await this.auditRepo.entry({
      actor_username: user.username,
      actor_role: 'client',
      action: 'client.password.change',
      target_type: 'user',
      target_id: user.id
    });
    return { ok: true };
  }

  @Post('license')
  @UseInterceptors(FileInterceptor('license', licenseUploadOptions))
  async uploadLicense(
    @UploadedFile() license: Express.Multer.File | undefined,
    @Req() req: Request & { user?: any }
  ) {
    const clientId = req.user?.client_id;
    if (!license) throw new BadRequestException('请上传营业执照（JPG、PNG 或 PDF，不超过 10MB）');
    try {
      const client: any = await this.clientRepo.findOne({ where: { id: clientId } });
      if (!client) throw new NotFoundException('企业资料不存在');
      license.originalname = decodeLicenseFileName(license.originalname);
      await this.clientRepo.update(clientId, {
        verification_status: 'pending',
        verification_note: null,
        verified_by: null,
        verified_at: null,
        license_file_path: path.relative(repoRoot(), license.path).replace(/\\/g, '/'),
        license_file_name: license.originalname,
        license_mime_type: license.mimetype,
        license_size_bytes: license.size
      });
      if (client.license_file_path) {
        const oldPath = path.resolve(repoRoot(), client.license_file_path);
        if (oldPath.startsWith(LICENSE_DIR + path.sep) && oldPath !== license.path) {
          try { fs.unlinkSync(oldPath); } catch { /* 旧文件可能已不存在 */ }
        }
      }
      await this.auditRepo.entry({
        actor_username: req.user?.username,
        actor_role: 'client',
        action: 'client.license.resubmit',
        target_type: 'client',
        target_id: clientId,
        detail: { license_file_name: license.originalname }
      });
      return this.get(req);
    } catch (e) {
      try { fs.unlinkSync(license.path); } catch { /* 文件可能未写入 */ }
      throw e;
    }
  }
}
