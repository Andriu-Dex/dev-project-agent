import path from 'node:path';
import type {CodeInventoryEntry, CoverageSettings} from '@dev-project-agent/contracts';
import {CodeError} from './evidence.js';

export const coverageDefaults: CoverageSettings = {
  batchUnits: 4, partBytes: 12_000, contextBytes: 8_000, maxSeconds: 120,
  intervalMinutes: 60, maxAttempts: 3, withAi: false, model: null, reasoningEffort: null, consent: false,
};
export const coverageReadBytes = 1_000_000;
export function validateCoverageSettings(settings: CoverageSettings) {
  for (const [key, min, max] of [['batchUnits',1,20],['partBytes',1000,24000],['contextBytes',0,16000],['maxSeconds',10,600],['intervalMinutes',1,10080],['maxAttempts',1,5]] as const) {
    if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) throw new CodeError('INVALID_REQUEST');
  }
  if (typeof settings.withAi !== 'boolean' || typeof settings.consent !== 'boolean' ||
      settings.model !== null && !/^[a-zA-Z0-9_./:-]{1,100}$/.test(settings.model) ||
      settings.reasoningEffort !== null && !['low','medium','high','xhigh','max'].includes(settings.reasoningEffort) ||
      settings.withAi && (!settings.consent || !settings.model)) throw new CodeError('CONSENT_REQUIRED');
  // Local providers have a smaller total input budget, including instructions and JSON escaping.
  if (settings.withAi && settings.model?.startsWith('ollama:') && settings.partBytes + settings.contextBytes > 12_000) throw new CodeError('INPUT_TOO_LARGE');
}
export function exclusionReason(entry: CodeInventoryEntry): string | null {
  const name = entry.path;
  if (name.length > 240 || /[\x00-\x1f\\]/.test(name) || name.split('/').some(value => !value || value === '.' || value === '..')) return 'unsupported_path';
  if (entry.type !== 'blob' || !['100644','100755'].includes(entry.mode)) return 'link_or_submodule';
  if (/(?:^|\/)(?:\.env[^/]*|[^/]*(?:secret|credential|password|private[-_]?key)[^/]*)(?:\/|$)|\.(?:pem|p12|pfx|key)$/i.test(name)) return 'sensitive_path';
  if (/(?:^|\/)(?:node_modules|vendor|dist|build|target|coverage|\.git|\.next|\.venv|__pycache__)(?:\/|$)|(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)|\.min\.[jt]s$|\.map$/i.test(name)) return 'generated_or_dependency';
  if (!/\.(?:[cm]?[jt]sx?|java|json|css|scss|html?|vue|svelte|py|sql|ya?ml|md|xml|properties|sh|ps1|cjs|mjs|toml)$/i.test(name) && !/(?:^|\/)(?:Dockerfile|Makefile)$/.test(name)) return 'binary_or_unsupported';
  if (entry.size === null || entry.size < 0 || entry.size > coverageReadBytes) return 'file_read_limit';
  return null;
}
export interface CoveragePart {content: string; startLine: number; endLine: number}
export function splitCoverageContent(content: string, maxBytes: number): CoveragePart[] {
  const rows = content.replace(/\r\n/g, '\n').split('\n');
  const parts: CoveragePart[] = [];
  let pending: string[] = [], size = 0, startLine = 1;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!, bytes = Buffer.byteLength(row) + 1;
    if (bytes > maxBytes) throw new CodeError('LINE_TOO_LARGE');
    if (pending.length && size + bytes > maxBytes) {
      parts.push({content: pending.join('\n'), startLine, endLine: index});
      pending = []; size = 0; startLine = index + 1;
    }
    pending.push(row); size += bytes;
  }
  if (pending.length) parts.push({content: pending.join('\n'), startLine, endLine: rows.length});
  return parts;
}
export function localDependencies(filename: string, content: string, inventory: Map<string, string>): Record<string,string> {
  const dependencies: Record<string,string> = {};
  const names = [...content.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\(|\bimport\s*)['"]([^'"\r\n]+)['"]/g)].map(match => match[1]!);
  for (const name of names.filter(value => value.startsWith('.'))) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), name));
    for (const candidate of [target, ...['.ts','.tsx','.js','.jsx','.json','.java'].map(extension => target + extension), ...['/index.ts','/index.tsx','/index.js'].map(suffix => target + suffix), target.replace(/\.js$/, '.ts'), target.replace(/\.jsx$/, '.tsx')]) {
      const hash = inventory.get(candidate);
      if (hash) {dependencies[candidate] = hash; break;}
    }
  }
  if (filename.endsWith('.java')) {
    const imports = [...content.matchAll(/\bimport\s+(?:static\s+)?([\w.]+)(\.\*)?\s*;/g)].map(match => match[1]!.replace(/\./g,'/'));
    const folder = path.posix.dirname(filename);
    for (const [candidate,hash] of inventory) {
      if (candidate === filename || !candidate.endsWith('.java')) continue;
      const name = path.posix.basename(candidate,'.java');
      const imported = imports.some(target => candidate.endsWith('/'+target+'.java') || target.startsWith(candidate.replace(/\.java$/,'').split('/java/').pop()!+'/'));
      if (imported || path.posix.dirname(candidate) === folder && new RegExp('\\b'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(content)) dependencies[candidate] = hash;
    }
  }
  return dependencies;
}
export function coveragePriority(file:{path:string;state:string}) {
  return (file.state==='outdated'?100:0)+(/\.(?:[cm]?[jt]sx?|java)$/.test(file.path)?20:0)+(/(?:auth|security|controller|service|shared\/api)/i.test(file.path)?10:0);
}
