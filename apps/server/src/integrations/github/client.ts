import type { GitHubSnapshot } from '@dev-project-agent/contracts';

export class GitHubError extends Error { constructor(readonly code: string) { super('GitHub source could not be read.'); } }
export interface GitHubConnection { owner: string; repository: string; branch: string }
export function githubToken(environment: NodeJS.ProcessEnv): string | null {
  const token = environment.GITHUB_TOKEN;
  if (!token) return null;
  if (!/^[a-zA-Z0-9_]{20,300}$/.test(token)) throw new GitHubError('INVALID_CREDENTIAL_CONFIG');
  return token;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GitHubError('INVALID_SOURCE');
  return value as Record<string, unknown>;
}
function text(value: unknown, limit = 4000): string {
  if (typeof value !== 'string' || value.length > limit) throw new GitHubError('INVALID_SOURCE'); return value;
}
function array(value: unknown): unknown[] { if (!Array.isArray(value) || value.length > 1000) throw new GitHubError('INVALID_SOURCE'); return value; }
function sha(value: unknown): string { const result = text(value); if (!/^[a-f0-9]{40}$/.test(result)) throw new GitHubError('INVALID_SOURCE'); return result; }
function count(value: unknown): number { if (!Number.isInteger(value) || (value as number) < 0) throw new GitHubError('INVALID_SOURCE'); return value as number; }

export async function readRepository(connection: GitHubConnection, previousHead: string | null, token: string | null, fetcher: typeof fetch = fetch): Promise<GitHubSnapshot> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(connection.owner) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(connection.repository) || connection.repository === '.' || connection.repository === '..' ||
    !connection.branch || connection.branch.length > 200 || /[\x00-\x20]/.test(connection.branch) || (previousHead !== null && !/^[a-f0-9]{40}$/.test(previousHead))) throw new GitHubError('INVALID_CONNECTION');
  const signal = AbortSignal.timeout(60_000);
  const prefix = `https://api.github.com/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repository)}`;
  async function get(suffix: string, parameters: Record<string,string> = {}) {
    const url = new URL(prefix + suffix); url.search = new URLSearchParams(parameters).toString();
    try {
      const response = await fetcher(url,{method:'GET',redirect:'error',signal,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
        ...(token ? {Authorization:`Bearer ${token}`} : {}), 'User-Agent':'dev-project-agent'}});
      if (!response.ok) throw new GitHubError(response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' ? 'RATE_LIMITED' : [401,403].includes(response.status) ? 'ACCESS_DENIED' : response.status === 404 ? 'NOT_FOUND' : 'SOURCE_UNAVAILABLE');
      if (!response.body) throw new GitHubError('INVALID_SOURCE');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 5_000_000) { await reader.cancel(); throw new GitHubError('SOURCE_TOO_LARGE'); } chunks.push(value); }
      return {data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown, hasNext: /rel="next"/.test(response.headers.get('link') ?? '')};
    } catch (error) { if (error instanceof GitHubError) throw error; throw new GitHubError('SOURCE_UNAVAILABLE'); }
  }
  const metadata = object((await get('')).data);
  if (text(metadata.full_name).toLowerCase() !== `${connection.owner}/${connection.repository}`.toLowerCase()) throw new GitHubError('REPOSITORY_MISMATCH');
  const branches: GitHubSnapshot['branches'] = [];
  for (let page=1; page<=5; page++) {
    const response = await get('/branches',{per_page:'100',page:String(page)});
    for (const value of array(response.data)) { const row=object(value); branches.push({name:text(row.name,200),sha:sha(object(row.commit).sha)}); }
    if (!response.hasNext) break;
    if (page===5) throw new GitHubError('SOURCE_TOO_LARGE');
  }
  const branch = branches.find(branch => branch.name === connection.branch);
  if (!branch) throw new GitHubError('BRANCH_NOT_FOUND');
  if (new Set(branches.map(branch=>branch.name)).size!==branches.length) throw new GitHubError('INVALID_SOURCE');
  const commits = array((await get('/commits',{sha:branch.sha,per_page:'25'})).data).map(value=>{
    const row=object(value), commit=object(row.commit), author=commit.author === null ? null : object(commit.author);
    const committed = commit.committer === null ? null : object(commit.committer);
    const committedAt = committed ? text(committed.date,100) : null;
    if (committedAt && !Number.isFinite(Date.parse(committedAt))) throw new GitHubError('INVALID_SOURCE');
    return {sha:sha(row.sha),message:text(commit.message).split('\n')[0]!,author:author ? text(author.name,200) : null,committedAt};
  });
  if (!commits.length || commits[0]!.sha !== branch.sha) throw new GitHubError('INCOMPLETE_SOURCE');
  let comparison: GitHubSnapshot['comparison'] = previousHead === branch.sha ? 'unchanged' : previousHead ? 'ahead' : 'initial_commit';
  const files: GitHubSnapshot['files'] = [];
  const limitations=['El historial muestra hasta 25 commits recientes de la revisión seleccionada; no es el historial completo.',
    'Se guardan metadatos y rangos de cambios, no contenido de código. No se han ejecutado pruebas ni una revisión de calidad o seguridad.'];
  if (comparison !== 'unchanged') {
    const suffix=previousHead ? `/compare/${previousHead}...${branch.sha}` : `/commits/${branch.sha}`;
    for (let page=1;page<=10;page++) {
      const response=await get(suffix,{per_page:'100',page:String(page)}); const data=object(response.data);
      if (previousHead) { const status=text(data.status); if (!['ahead','behind','diverged','identical'].includes(status)) throw new GitHubError('INVALID_SOURCE'); comparison=status==='identical' ? 'unchanged' : status as 'ahead'|'behind'|'diverged'; }
      // Compare responses contain the complete file list only on the first page, capped by GitHub at 300 files.
      const rawFiles=array(data.files ?? []);
      if (previousHead && rawFiles.length>=300) throw new GitHubError('COMPARISON_TOO_LARGE');
      for (const value of rawFiles) {
        const row=object(value), filename=text(row.filename,1000);
        if (filename.startsWith('/') || filename.split('/').includes('..') || /[\x00-\x1f]/.test(filename)) throw new GitHubError('INVALID_SOURCE');
        const patch=typeof row.patch==='string' ? row.patch : '';
        const hunks=[...patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map(match=>({startLine:Number(match[1]),lineCount:match[2]===undefined ? 1 : Number(match[2])}));
        files.push({path:filename,previousPath:row.previous_filename===undefined ? null : text(row.previous_filename,1000),status:text(row.status,100),additions:count(row.additions),deletions:count(row.deletions),hunks});
      }
      if (previousHead || !response.hasNext) break;
      if (page===10) throw new GitHubError('SOURCE_TOO_LARGE');
    }
  }
  if (new Set(files.map(file=>file.path)).size!==files.length) throw new GitHubError('INCOMPLETE_SOURCE');
  if (comparison==='initial_commit') limitations.push('Primera lectura: los archivos corresponden únicamente al último commit, no a todo el repositorio.');
  if (comparison==='behind' || comparison==='diverged') limitations.push('La historia de la rama retrocedió o divergió. La comparación no acredita un avance lineal.');
  return {repository:{owner:connection.owner,name:connection.repository,defaultBranch:text(metadata.default_branch,200)},branch:connection.branch,head:branch.sha,base:previousHead,branches,commits,files,comparison,limitations};
}
