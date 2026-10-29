/**
 * 统一加载环境变量：仓库根目录 .env 优先，其次 cwd/.env。
 * 无论进程 cwd 在仓库根还是 apps/api，都能读到同一份配置。
 * 已被显式设置的系统环境变量不会被覆盖（dotenv 默认行为）。
 */
import path from 'path';
import dotenv from 'dotenv';
import { repoRoot } from './mock-db';

dotenv.config({ path: path.join(repoRoot(), '.env') });
dotenv.config();
