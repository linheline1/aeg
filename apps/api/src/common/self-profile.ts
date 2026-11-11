import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { assertValidPassword } from './password-policy';
import { AuditRepo, UserRepo } from './mock-db';

/** 员工自助账户信息（运营端 / 管理端 / 清关行共用，绝不返回密码哈希） */
export async function getSelfProfile(userRepo: UserRepo, userId?: string) {
  const user: any = await userRepo.findOne({ where: { id: userId } });
  if (!user) throw new NotFoundException('账户不存在');
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

/** 员工自助改密：校验当前密码 → 统一密码策略 → 更新并写审计 */
export async function changeSelfPassword(
  userRepo: UserRepo,
  auditRepo: AuditRepo,
  userId: string | undefined,
  body: { current_password?: string; new_password?: string }
) {
  const user: any = await userRepo.findOne({ where: { id: userId } });
  if (!user) throw new NotFoundException('账户不存在');
  if (!body.current_password || !await bcrypt.compare(body.current_password, user.password_hash)) {
    throw new BadRequestException('当前密码不正确');
  }
  const password = body.new_password || '';
  assertValidPassword(password, '新密码');
  if (await bcrypt.compare(password, user.password_hash)) {
    throw new BadRequestException('新密码不能与当前密码相同');
  }
  await userRepo.update(user.id, { password_hash: await bcrypt.hash(password, 12) });
  await auditRepo.entry({
    actor_username: user.username,
    actor_role: user.role,
    action: 'staff.password.self_change',
    target_type: 'user',
    target_id: user.id
  });
  return { ok: true };
}
