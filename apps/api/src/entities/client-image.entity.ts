import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

/** 客户上传图片（M5 货物照片；M6 关联订单明细截图） */
@Entity('client_image')
export class ClientImageEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index()
  @Column({ type: 'uuid' })
  client_id!: string;

  /** 关联报价订单；null=未关联 */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  quote_id?: string | null;

  /** 关联明细行号；null=整单维度 */
  @Column({ type: 'int', nullable: true })
  row_no?: number | null;

  @Column({ type: 'varchar', length: 255 })
  file_name!: string;

  @Column({ type: 'varchar', length: 500 })
  file_path!: string;

  @Column({ type: 'varchar', length: 100 })
  mime_type!: string;

  @Column({ type: 'int' })
  size_bytes!: number;

  @CreateDateColumn()
  created_at!: Date;
}
