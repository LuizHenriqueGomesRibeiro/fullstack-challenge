#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const COMMIT_ENV = 'CRASH_GAME_NPM_COMMIT';
const env = { ...process.env, [COMMIT_ENV]: '1' };
// npm 11's npx path is broken in this workspace, so call the local binary directly.
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
