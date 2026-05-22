const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const FIXTURES_DIR = path.join(__dirname, '..', '__tests__', 'fixtures', 'faulty-packages');
const OUT_DIR = FIXTURES_DIR;

function findPackageDirs() {
  return fs.readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(FIXTURES_DIR, d.name));
}

function zipDir(srcDir, destZip, cb) {
  // Use PowerShell Compress-Archive on Windows for simplicity
  const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${destZip}' -Force"`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) return cb(err);
    cb(null);
  });
}

function run() {
  const dirs = findPackageDirs();
  dirs.forEach(dir => {
    const name = path.basename(dir);
    const zipPath = path.join(OUT_DIR, `${name}.zip`);
    console.log('Zipping', dir, '->', zipPath);
    zipDir(dir, zipPath, err => {
      if (err) console.error('Failed to zip', dir, err);
      else console.log('Created', zipPath);
    });
  });
}

if (require.main === module) run();
