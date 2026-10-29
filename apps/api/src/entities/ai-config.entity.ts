import { Entity, PrimaryColumn, Column } from 'typeorm';

/** AI 模型 API 配置（单行表，id 固定为 'default'）：管理端可运行时维护，环境变量兜底 */
@Entity('ai_config')
export class AiConfigEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  /** OpenAI 兼容服务地址，如 https://api.openai.com/v1 */
  @Column({ type: 'varchar', length: 500, default: '' })
  base_url!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  api_key!: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  model!: string;

  @Column({ type: 'integer', default: 60000 })
  timeout_ms!: number;

  @Column({ type: 'varchar', length: 50 })
  updated_by!: string;

  @Column({ type: 'timestamp' })
  updated_at!: Date;
}
