#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const electronPackageDir = path.join(rootDir, 'node_modules', 'electron');
const electronBinaryName = process.platform === 'win32' ? 'electron.exe' : 'electron';
const electronDistPath = path.join(electronPackageDir, 'dist', electronBinaryName);

if (fs.existsSync(electronDistPath)) {
  console.log('Electron runtime already available.');
  process.exit(0);
}

console.log('Preparing Electron runtime...');

const installScript = path.join(electronPackageDir, 'install.js');
const result = spawnSync(process.execPath, [installScript], {
  cwd: rootDir,
  stdio: 'inherit'
});

if (result.status !== 0) {
  console.warn('Electron runtime bootstrap did not complete successfully; continuing because the build tooling can fetch it if needed.');
  process.exit(0);
}

if (fs.existsSync(electronDistPath)) {
  console.log('Electron runtime prepared successfully.');
} else {
  console.warn('Electron runtime was not available after install. The build step may fetch it automatically.');
}
