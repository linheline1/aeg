import { Entity, PrimaryColumn, Column } from 'typeorm';

/** AI 模型 API 配置（多行，每行一个命名配置，active 的那行生效）：管理端可运行时维护，环境变量兜底 */
@Entity('ai_config')
export class AiConfigEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  /** 配置名称（如「生产 Key」「备用线路」） */
  @Column({ type: 'varchar', length: 120, default: '' })
  name!: string;

  /** OpenAI 兼容服务地址，如 https://api.openai.com/v1 */
  @Column({ type: 'varchar', length: 500, default: '' })
  base_url!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  api_key!: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  model!: string;

  @Column({ type: 'integer', default: 60000 })
  timeout_ms!: number;

  /** 是否为当前启用的配置（同一时刻最多一条 active） */
  @Column({ type: 'boolean', default: false })
  active!: boolean;

  @Column({ type: 'varchar', length: 50 })
  updated_by!: string;

  @Column({ type: 'timestamp' })
  updated_at!: Date;
}
