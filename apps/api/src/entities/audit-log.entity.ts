import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

@Entity('audit_log')
export class AuditLogEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index()
  @CreateDateColumn()
  ts!: Date;

  @Column({ type: 'varchar', length: 50, default: 'system' })
  actor_username!: string;

  @Column({ type: 'varchar', length: 20, default: 'system' })
  actor_role!: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  action!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  target_type?: string | null;

  @Column({ type: 'varchar', nullable: true })
  target_id?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detail?: any;
}
