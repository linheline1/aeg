import {
  Entity, PrimaryColumn, Column, Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

/** 费率表（M2）：全局默认 + 按客户覆盖 */
@Entity('fee_rate')
@Index(['scope', 'client_id'], { unique: true })
export class FeeRateEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Column({ type: 'varchar', length: 10 })
  scope!: 'global' | 'client';

  @Column({ type: 'uuid', nullable: true })
  client_id!: string | null;

  @Column({ type: 'double precision' })
  ocean_freight_usd!: number;

  @Column({ type: 'double precision' })
  port_fee_usd!: number;

  /** 巴西本地拖车费（BRL，按柜） */
  @Column({ type: 'double precision', default: 0 })
  br_trucking_brl!: number;

  @Column({ type: 'double precision' })
  br_clearance_brl!: number;

  @Column({ type: 'double precision' })
  fx_rate!: number;

  @Column({ type: 'double precision', default: 0.065 })
  sales_tax_rate!: number;

  @Column({ type: 'double precision', default: 0.20 })
  sales_markup_rate!: number;

  @Column({ type: 'double precision', default: 30000 })
  profit_brl!: number;

  @Column({ type: 'varchar', length: 50 })
  updated_by!: string;

  @Column({ type: 'timestamp' })
  updated_at!: Date;
}
