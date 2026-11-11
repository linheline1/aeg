import {
  Body, Controller, Post, Get, HttpCode, UnauthorizedException, Req,
  UploadedFile, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import { Public } from '../common/guards/auth.guard';
import { decodeLicenseFileName, licenseUploadOptions } from '../common/license-upload';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly audit: AuditService
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: { username: string; password: string }) {
    const user = await this.authService.findByUsername(dto.username);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      client_id: user.client_id || undefined
    };
    const token = this.jwtService.sign(payload);
    await this.audit.log('LOGIN', { target_type: 'user', target_id: user.id }, null, user.id);
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 43200,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        client_id: user.client_id || undefined,
        status: user.status
      }
    };
  }

  @Public()
  @Post('register')
  @UseInterceptors(FileInterceptor('license', licenseUploadOptions))
  async register(
    @Body() dto: {
      china_company_name?: string;
      china_uscc?: string;
      username?: string;
      password?: string;
    },
    @UploadedFile() license?: Express.Multer.File
  ) {
    if (license) license.originalname = decodeLicenseFileName(license.originalname);
    try {
      const user = await this.authService.register(dto, license);
      return { ok: true, user };
    } catch (e) {
      if (license) {
        try { fs.unlinkSync(license.path); } catch { /* 文件可能未写入 */ }
      }
      throw e;
    }
  }

  @Get('me')
  async me(@Req() req: Request & { user?: any }) {
    const u = req.user;
    return {
      id: u.sub,
      username: u.username,
      role: u.role,
      client_id: u.client_id || undefined
    };
  }
}
