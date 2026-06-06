#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const COMMIT_ENV = 'CRASH_GAME_BUN_COMMIT';
const env = { ...process.env, [COMMIT_ENV]: '1' };
// Bun shelling into Commitizen via the local binary keeps the flow stable in this workspace.
const commitizenBin = join(__dirname, '..', 'node_modules', 'commitizen', 'bin', 'git-cz.js');

const result = spawnSync(process.execPath, [commitizenBin], {
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
