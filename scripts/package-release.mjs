import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const execute=promisify(execFile),git=async(...args)=>(await execute('git',args,{windowsHide:true,maxBuffer:4_000_000})).stdout;
if((await git('status','--porcelain')).trim())throw new Error('Commit the reviewed changes before packaging.');
const branch=(await git('branch','--show-current')).trim();
if(!['develop','main'].includes(branch))throw new Error('Package only a reviewed develop/main commit.');
const commit=(await git('rev-parse','HEAD')).trim(),metadata=JSON.parse(await readFile('package.json','utf8'));
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'run','build'],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Release build failed.')));});
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),basename=`dev-project-agent-${metadata.version}-${commit.slice(0,8)}-${stamp}`;
const staging=path.resolve('work/packages',basename),archive=staging+'.zip';await mkdir(staging,{recursive:true});
const files=(await git('ls-files','-z')).split('\0').filter(Boolean);
async function collect(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=directory+'/'+entry.name;if(entry.isDirectory())await collect(file);else if(entry.isFile())files.push(file);else throw new Error('Unsupported build output entry.');}}
for(const directory of ['apps/server/dist','apps/web/dist','packages/contracts/dist'])await collect(directory);
const forbidden=/(?:^|\/)(?:node_modules|\.git|work|backups|runtime-data|presentation-local)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|docs\/utaped-trello[^/]*\.json$/i;
const secrets=Object.entries(process.env).filter(([key,value])=>/(?:TOKEN|SECRET|PASSWORD|SMTP_PASS|CREDENTIAL_KEY|API_KEY)/i.test(key)&&value&&value.length>=12).map(([,value])=>value);
const manifest={name:metadata.name,version:metadata.version,commit,branch,createdAt:new Date().toISOString(),files:[]};
for(const file of [...new Set(files)].sort()){
  if(forbidden.test(file)&&file!=='.env.example')throw new Error('A private or temporary file is tracked; review the release selection.');
  const data=await readFile(file);
  if(secrets.some(secret=>data.includes(Buffer.from(secret))))throw new Error('A selected release file contains a configured secret.');
  const target=path.join(staging,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);
  manifest.files.push({path:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
await writeFile(path.join(staging,'release-manifest.json'),JSON.stringify(manifest,null,2));
if(process.platform!=='win32')throw new Error('The release archive helper currently requires Windows PowerShell. Source staging is available.');
await execute('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./archive-release.ps1',import.meta.url)),'-Source',staging,'-Destination',archive],{windowsHide:true,env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toLowerCase()!=='psmodulepath'))});
const sha256=createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(archive+'.sha256',sha256+'  '+path.basename(archive)+'\n');
await writeFile(archive+'.validation.json',JSON.stringify({archive,commit,version:metadata.version,files:manifest.files.length,sha256,entryHashesVerified:true,knownConfiguredSecretsChecked:true,excludedPrivateState:true},null,2));
console.log(JSON.stringify({archive,staging,commit,sha256,files:manifest.files.length}));
