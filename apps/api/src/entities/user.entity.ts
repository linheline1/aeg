import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  DeleteDateColumn, ManyToOne, JoinColumn, BeforeInsert, Index
} from 'typeorm';
import * as crypto from 'crypto';
import { ClientEntity } from './client.entity';

@Entity('user')
export class UserEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  username!: string;

  @Column({ type: 'text', nullable: true })
  avatar_data?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  sales_phone?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sales_wechat?: string | null;

  @Column({ type: 'varchar', length: 255 })
  password_hash!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: 'admin' | 'operator' | 'sales' | 'customs' | 'client';

  @Column({ type: 'uuid', nullable: true })
  client_id?: string | null;

  @ManyToOne(() => ClientEntity, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'disabled';

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
