import type {CodeCheck,CodeFile,CodeFinding} from '@dev-project-agent/contracts';
export const standardCatalog={version:'utaped-review-v1',provenance:'Project review criteria; isolated source checks do not certify ISO compliance.',rules:[
  {id:'syntax',category:'correctness',language:'typescript',criterion:'Isolated TypeScript transformation without syntax errors.'},
  {id:'java-delimiters',category:'correctness',language:'java',criterion:'Balanced braces, brackets and parentheses outside comments and literals; compilation remains pending.'},
  {id:'condition-assignment',category:'correctness',language:'both',criterion:'Review assignments used as a conditional test.'},
  {id:'dynamic-content',category:'security',language:'both',criterion:'Review executable or interpreted content and concatenated database queries.'},
  {id:'duplicate-block',category:'duplication',language:'both',criterion:'Review repeated nonempty code blocks of five lines and at least 100 characters.'},
  {id:'debug-output',category:'maintainability',language:'both',criterion:'Review production console/debug output for intent and data exposure.'},
  {id:'decision-density',category:'complexity',language:'both',criterion:'Review ten or more decision tokens in a forty-line source window.'},
  {id:'nested-loop',category:'performance',language:'both',criterion:'Review nested iteration for input-size growth; require measurement before claiming an optimization.'},
] as const};

// Preserve newlines and character positions while hiding untrusted literals and comments from token checks.
export function lexicalCode(content:string) {
  return content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,value=>value.replace(/[^\r\n]/g,' '));
}
export function javaDelimiterCheck(file:CodeFile):CodeCheck {
  const stack:string[]=[],code=lexicalCode(file.content),pairs:Record<string,string>={')':'(',']':'[','}':'{'};let mismatch=false;
  for(const token of code){if('([{'.includes(token))stack.push(token);else if(Object.hasOwn(pairs,token)&&stack.pop()!==pairs[token]){mismatch=true;break;}}
  return {path:file.path,code:standardCatalog.version+'/java-delimiters',status:mismatch||stack.length?'fail':'pass',message:mismatch||stack.length?'Delimitadores no equilibrados en el fragmento Java.':'Delimitadores equilibrados; no comprueba gramática, tipos, dependencias ni compilación Java.'};
}
export function standardChecks(files:CodeFile[],findings:CodeFinding[],syntax:CodeCheck[]):CodeCheck[] {
  const results:CodeCheck[]=[];
  for(const file of files)for(const rule of standardCatalog.rules){
    if(rule.language==='java'&&!file.path.endsWith('.java')||rule.language==='typescript'&&!/\.[jt]sx?$/.test(file.path))continue;
    if(rule.id==='java-delimiters'){results.push(javaDelimiterCheck(file));continue;}
    if(rule.id==='syntax'){const result=syntax.find(check=>check.path===file.path&&check.code==='typescript_syntax');results.push({path:file.path,code:standardCatalog.version+'/'+rule.id,status:result?.status??'not_checked',message:result?.message??'No comprobado en este lenguaje.'});continue;}
    const observed=findings.some(finding=>finding.path===file.path&&finding.category===rule.category);
    results.push({path:file.path,code:standardCatalog.version+'/'+rule.id,status:observed?'not_checked':'pass',message:observed?'Hay una señal en esta categoría que requiere revisión de contexto; no es un defecto confirmado.':'No se detectó el patrón acotado del catálogo en el archivo seleccionado; no acredita ausencia de otros defectos.'});
  }
  return results;
}
