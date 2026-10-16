import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Inspect repository documentation without traversing ignored private artifacts.
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0'))]
  .filter((file) => file.endsWith('.md') && existsSync(file));
const failures = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(target)) continue;
    const local = decodeURIComponent(target.split(/[?#]/)[0]);
    if (local && !existsSync(path.resolve(path.dirname(file), local))) failures.push(`${file}: ${target}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified local link destinations in ${files.length} Markdown files.`);
}
