#!/usr/bin/env node
// Entry point — delegates to TypeScript CLI via --experimental-strip-types
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, '..', 'src', 'cli.ts');

try {
  const result = execFileSync('node', ['--experimental-strip-types', cli, ...process.argv.slice(2)], {
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
    timeout: 30000,
  });
  if (result) process.stdout.write(result);
} catch (err) {
  if (err.stderr) process.stderr.write(err.stderr);
  if (err.stdout) process.stdout.write(err.stdout);
  process.exit(err.status ?? 1);
}
