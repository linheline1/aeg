import { BadRequestException } from '@nestjs/common';

/** 密码最少位数 */
export const PASSWORD_MIN_LENGTH = 6;
/** bcrypt 只取前 72 字节，超过部分会被静默忽略 → 统一拒绝，避免"尾部无效"的误解 */
export const PASSWORD_MAX_BYTES = 72;

/**
 * 统一密码规则（员工/客户创建、重置密码、注册）：
 *   - 不允许首尾空格（否则登录时必须原样输入空格，极易锁死账号）
 *   - 至少 6 位
 *   - UTF-8 不超过 72 字节（bcrypt 上限）
 * 返回去除校验后的原密码（内部空格保留）。
 */
export function assertValidPassword(password: string | null | undefined, label = '密码'): string {
  const p = password ?? '';
  if (p !== p.trim()) {
    throw new BadRequestException(`${label}不能包含首尾空格`);
  }
  if (p.length < PASSWORD_MIN_LENGTH) {
    throw new BadRequestException(`${label}至少 ${PASSWORD_MIN_LENGTH} 位`);
  }
  if (Buffer.byteLength(p, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new BadRequestException(`${label}过长（最多 72 字节，约 72 个英文字符或 24 个中文字符）`);
  }
  return p;
}
