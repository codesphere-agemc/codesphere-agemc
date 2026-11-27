// Runs every Aptitude test file against a throwaway in-memory MongoDB.
// Usage (from server/): npm run test:aptitude
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
let failed = 0;
for (const file of files) {
  const run = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8', env: { ...process.env, JWT_SECRET: 'test-secret' } });
  const out = `${run.stdout || ''}${run.stderr || ''}`;
  const ok = run.status === 0 && /ALL PASS|All checks passed/.test(out);
  const checks = (out.match(/^PASS /gm) || []).length;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}  (${checks} checks)`);
  if (!ok) {
    failed += 1;
    console.log(out.split('\n').filter((l) => !l.startsWith('PASS')).join('\n'));
  }
}
console.log(failed ? `\n${failed} of ${files.length} files failed.` : `\nAll ${files.length} files passed.`);
process.exitCode = failed ? 1 : 0;
