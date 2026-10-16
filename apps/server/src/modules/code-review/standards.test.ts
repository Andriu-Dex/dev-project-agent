import {describe,it,expect} from 'vitest';
import type {CodeFinding} from '@dev-project-agent/contracts';
import {codeFixture} from './fixtures.js';
import {deterministicAnalysis} from './evidence.js';
import {javaDelimiterCheck,lexicalCode,standardCatalog} from './standards.js';
const repeated=Array.from({length:5},(_,index)=>`calculator.recordResult(${index}, pendingResult, previousResult);`).join('\n');
const cases:{category:CodeFinding['category'];positive:string;negative:string}[]=[
  {category:'correctness',positive:'if (value = pendingValue) { consume(value); }',negative:'if (value === pendingValue) { consume(value); }'},
  {category:'security',positive:'return eval(input);',negative:'return JSON.parse(input); // eval(input) is intentionally absent'},
  {category:'duplication',positive:repeated+'\n'+repeated,negative:repeated},
  {category:'maintainability',positive:'console.log(customerRecord);',negative:'logger.info({event: statusCode});'},
  {category:'complexity',positive:Array.from({length:12},(_,index)=>`if (flag${index}) { process(${index}); }`).join('\n'),negative:'if (ready) { process(1); }'},
  {category:'performance',positive:'for (const x of values) { for (const y of others) { compare(x,y); } }',negative:'for (const x of values) { compare(x); }'},
];
describe('Controlled category corpus and versioned review standards',()=>{
  for(const language of ['typescript','java'])it.each(cases)(`checks ${language} $category with a positive and counterexample`,({category,positive,negative})=>{
    const source=codeFixture();source.files[0]!.path=language==='java'?'src/Fixture.java':'src/Fixture.ts';
    if(language==='java'){
      positive=positive.replace('eval(input)','statement.executeQuery(sql + input)').replace('console.log','System.out.println').replaceAll('===','==').replaceAll('const x of values','int x=0;x<10;x++').replaceAll('const y of others','int y=0;y<10;y++');
      negative=negative.replaceAll('===','==').replace('JSON.parse(input)','parser.read(input)').replaceAll('const x of values','int x=0;x<10;x++');
    }
    source.files[0]!.content=positive;const result=deterministicAnalysis(source),finding=result.findings.find(item=>item.category===category);expect(finding).toBeDefined();expect(finding?.confidence).toBe('hypothesis');expect(finding?.evidence).toBeTruthy();
    expect(result.checks.some(check=>check.code.startsWith(standardCatalog.version+'/'))).toBe(true);
    source.files[0]!.content=negative;expect(deterministicAnalysis(source).findings.some(item=>item.category===category)).toBe(false);
  });
  it('checks Java delimiters outside literals and comments without claiming compilation',()=>{
    const file={...codeFixture().files[0]!,path:'src/Fixture.java',content:'class Fixture { String text="{"; /* } */ void method() {} }'};
    expect(javaDelimiterCheck(file).status).toBe('pass');expect(javaDelimiterCheck({...file,content:'class Fixture { void method() { ] }'}).status).toBe('fail');
    expect(lexicalCode('console.log("eval(input)"); // eval(input)')).not.toContain('eval(input)');
  });
});
