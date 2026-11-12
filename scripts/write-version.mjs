#!/usr/bin/env node
/**
 * 写入当前端的构建版本信息到仓库根目录 versions.json（保留其它端数据）
 * 用法：node scripts/write-version.mjs <api|admin|ops|client|customs> <appDir>
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = process.argv[2];
const APP_DIR = process.argv[3];

if (!KEY || !APP_DIR) {
  console.error('用法：node scripts/write-version.mjs <key> <appDir>');
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.resolve(process.cwd(), APP_DIR);
const pkgPath = path.join(appDir, 'package.json');
const versionsPath = path.join(repoRoot, 'versions.json');

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function shortCommit() {
  try {
    const out = execSync('git rev-parse --short HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
    return out || 'unknown';
  } catch {
    return 'unknown';
  }
}

let versions = {};
try {
  versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8')) || {};
} catch {
  versions = {};
}

versions[KEY] = {
  version: readVersion(),
  commit: shortCommit(),
  builtAt: new Date().toISOString()
};

fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n', 'utf8');
console.log(
  `✅ versions.json ← ${KEY} (${versions[KEY].version} @ ${versions[KEY].commit})`
);
