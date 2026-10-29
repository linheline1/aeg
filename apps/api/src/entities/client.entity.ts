import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  DeleteDateColumn, OneToMany, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';
import { UserEntity } from './user.entity';

@Entity('client')
export class ClientEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  china_company_name?: string | null;

  @Column({ type: 'varchar', length: 18, nullable: true })
  china_uscc?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'approved' })
  verification_status!: 'pending' | 'approved' | 'rejected';

  @Column({ type: 'text', nullable: true })
  verification_note?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  verified_by?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verified_at?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  license_file_path?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  license_file_name?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  license_mime_type?: string | null;

  @Column({ type: 'integer', nullable: true })
  license_size_bytes?: number | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'disabled';

  /** 归属业务员（M4：客户维度默认业务员，该客户新报价自动继承） */
  @Column({ type: 'uuid', nullable: true })
  salesperson_id?: string | null;

  @OneToMany(() => UserEntity, (u) => u.client)
  users!: UserEntity[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
