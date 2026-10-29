import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

/** 回款记录（M10 财务：done 订单的应收分期回款登记） */
@Entity('payment_record')
export class PaymentRecordEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index()
  @Column({ type: 'uuid' })
  quote_id!: string;

  /** 回款金额（BRL） */
  @Column({ type: 'double precision' })
  amount_brl!: number;

  /** 回款日期 */
  @Column({ type: 'date' })
  paid_at!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  /** 登记人用户名 */
  @Column({ type: 'varchar', length: 50 })
  created_by!: string;

  @CreateDateColumn()
  created_at!: Date;
}
