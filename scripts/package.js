'use strict';

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const extensionDir = path.join(root, 'extension');
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'),
);

const outName = `wst-no-spoilers-v${manifest.version}.zip`;
const outPath = path.join(root, outName);

// Remove old zip if it exists
if (fs.existsSync(outPath)) {
  fs.unlinkSync(outPath);
}

// Use PowerShell on Windows, zip on Unix
const isWin = process.platform === 'win32';

if (isWin) {
  execSync(
    `powershell -Command "Compress-Archive -Path '${extensionDir}\\*' -DestinationPath '${outPath}'"`,
    { stdio: 'inherit' },
  );
} else {
  execSync(`cd "${extensionDir}" && zip -r "${outPath}" .`, {
    stdio: 'inherit',
  });
}

console.log(`Packaged: ${outName}`);
