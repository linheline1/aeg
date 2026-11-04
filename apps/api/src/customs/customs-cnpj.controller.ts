import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, Res,
  UploadedFile, UseGuards, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { repoRoot } from '../common/mock-db';
import { CnpjInput, CustomsCnpjService } from './customs-cnpj.service';

const CERTIFICATE_DIR = path.join(repoRoot(), 'apps/api/uploads/certificates');
const certificateUploadOptions: any = {
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: (error: any, destination: string) => void) => {
      fs.mkdirSync(CERTIFICATE_DIR, { recursive: true });
      cb(null, CERTIFICATE_DIR);
    },
    filename: (_req: any, file: any, cb: (error: any, name: string) => void) => {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!/\.(?:pfx|p12)$/i.test(file.originalname || '')) {
      return cb(new BadRequestException('O certificado deve ser um arquivo .pfx ou .p12'), false);
    }
    cb(null, true);
  }
};

function actor(req: Request & { user?: any }) {
  return { username: req.user?.username || 'system', role: req.user?.role || 'system' };
}

@Controller('admin/customs-cnpjs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminCustomsCnpjController {
  constructor(private readonly service: CustomsCnpjService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() body: CnpjInput, @Req() req: Request & { user?: any }) {
    return this.service.create(body, actor(req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: CnpjInput, @Req() req: Request & { user?: any }) {
    return this.service.update(id, body, actor(req), true);
  }

  @Post(':id/certificates/a1')
  @UseInterceptors(FileInterceptor('file', certificateUploadOptions))
  uploadA1(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request & { user?: any }) {
    return this.service.uploadCertificate(id, 'a1', file, actor(req));
  }

  @Post(':id/certificates/ecpf')
  @UseInterceptors(FileInterceptor('file', certificateUploadOptions))
  uploadEcpf(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request & { user?: any }) {
    return this.service.uploadCertificate(id, 'ecpf', file, actor(req));
  }

  @Get(':id/certificates/a1/file')
  async downloadA1(@Param('id') id: string, @Res() res: Response) {
    const file = await this.service.certificate(id, 'a1');
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename="certificado-a1.pfx"`);
    res.sendFile(file.absolute);
  }

  @Get(':id/certificates/ecpf/file')
  async downloadEcpf(@Param('id') id: string, @Res() res: Response) {
    const file = await this.service.certificate(id, 'ecpf');
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename="e-cpf.pfx"`);
    res.sendFile(file.absolute);
  }
}

@Controller('customs/cnpjs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('customs')
export class CustomsCnpjController {
  constructor(private readonly service: CustomsCnpjService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: CnpjInput, @Req() req: Request & { user?: any }) {
    return this.service.update(id, body, actor(req));
  }
}
