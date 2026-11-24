import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  SetMetadata
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import type { UserRepo } from '../mock-db';

// Some controllers also declare this global guard explicitly.
const checkedSession = Symbol('checkedSession');

/** 标记公开路由，跳过 JWT 校验 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    @Inject('UserRepo') private readonly users: UserRepo
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: object; [checkedSession]?: boolean }>();
    if (req[checkedSession]) return true;
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = header.substring(7);
    let payload: { sub?: string; session_revision?: string | null };
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod'
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!payload.sub || payload.session_revision === undefined) {
      throw new UnauthorizedException('Please sign in again');
    }
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 'active' || (user.session_revision ?? null) !== payload.session_revision) {
      throw new UnauthorizedException('Session is no longer active');
    }
    req.user = { sub: user.id, username: user.username, role: user.role, client_id: user.client_id || undefined };
    req[checkedSession] = true;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!allowed) return true;
    const req = context.switchToHttp().getRequest<any>();
    const user = req.user;
    if (!user || !allowed.includes(user.role)) return false;
    return true;
  }
}
