import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard, RolesGuard } from '../common/guards/auth.guard';
import { ClientScopeInterceptor } from '../common/interceptors/client-scope.interceptor';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { UserService } from '../user/user.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuditService,
    UserService,
    // 全局 Guard / Interceptor
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ClientScopeInterceptor }
  ],
  exports: [JwtModule]
})
export class AuthModule {}
