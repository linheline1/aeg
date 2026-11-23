import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { CustomsController } from './customs.controller';
import { CustomsProfileController } from './profile.controller';
import { AdminCustomsCnpjController, CustomsCnpjController } from './customs-cnpj.controller';
import { CustomsService } from './customs.service';
import { CustomsCnpjService } from './customs-cnpj.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [AuthModule, OrderModule, UploadModule],
  controllers: [CustomsController, CustomsProfileController, AdminCustomsCnpjController, CustomsCnpjController],
  providers: [CustomsService, CustomsCnpjService]
})
export class CustomsModule {}
