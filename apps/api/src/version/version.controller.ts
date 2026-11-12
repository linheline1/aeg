import { Controller, Get } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../common/guards/auth.guard';

/**
 * 读取仓库根目录 versions.json（构建时由 scripts/write-version.mjs 写入）
 * 从 process.cwd() 逐级向上查找；文件不存在时返回空对象，不影响服务。
 */
function loadVersions(): Record<string, unknown> {
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    try {
      const raw = fs.readFileSync(path.join(dir, 'versions.json'), 'utf8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // 继续向上查找
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return {};
}

/**
 * 公开接口：各端版本信息（无需登录）
 *   GET /api/version
 */
@Controller('version')
@Public()
export class VersionController {
  @Get()
  get() {
    return {
      entries: loadVersions(),
      serverTime: new Date().toISOString()
    };
  }
}
