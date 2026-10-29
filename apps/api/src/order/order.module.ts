import { Module } from '@nestjs/common';
import { ClientOrderController } from './client-order.controller';
import { OpsOrderController } from './ops-order.controller';
import { DealsController } from './deals.controller';
import { OpsOrderFilesController, ClientOrderFilesController } from './order-files.controller';
import { ClientCnpjController } from './cnpj.controller';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { DiController } from './di.controller';
import { DiService } from './di.service';
import { AiNcmService } from './ai-ncm.service';

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [ClientOrderController, OpsOrderController, DealsController, OpsOrderFilesController, ClientOrderFilesController, ClientCnpjController, DiController],
  providers: [DiService, AiNcmService]
})
export class OrderModule {}
