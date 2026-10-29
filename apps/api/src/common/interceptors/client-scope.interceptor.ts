import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

/**
 * 客户端数据隔离拦截器
 * 应用在 /api/client/** 路由的 Service 层 Repository 查询上。
 * 在 M1 中以 Guard 的形式示范：Controller 层如果接收到 client 角色且 query/body 中带有 client_id，
 * 强制忽略该值，改用 JWT 中的 client_id。M2 起改用 Repository scopeClient() 实现更彻底的隔离。
 */
@Injectable()
export class ClientScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const user = req.user;
    if (!user) return next.handle();

    // client 角色：强制过滤 query/body 中的 client_id
    if (user.role === 'client') {
      // 禁止通过 query 参数指定他人 client_id
      const query: any = (req as any).query || {};
      if (query.client_id && query.client_id !== user.client_id) {
        throw new ForbiddenException('Forbidden');
      }
      const body: any = (req as any).body || {};
      if (body.client_id && body.client_id !== user.client_id) {
        throw new ForbiddenException('Forbidden');
      }
    }

    return next.handle();
  }
}
