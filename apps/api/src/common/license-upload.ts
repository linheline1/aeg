import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import { repoRoot } from './mock-db';

export const LICENSE_DIR = path.join(repoRoot(), 'apps/api/uploads/licenses');

const LICENSE_MIMES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf'
};

export function decodeLicenseFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

export const licenseUploadOptions: any = {
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(LICENSE_DIR, { recursive: true });
      cb(null, LICENSE_DIR);
    },
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${LICENSE_MIMES[file.mimetype] || ''}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (!LICENSE_MIMES[file.mimetype]) {
      return cb(new BadRequestException('营业执照仅支持 JPG、PNG 或 PDF 文件'), false);
    }
    cb(null, true);
  }
};
