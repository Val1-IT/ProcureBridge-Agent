import {readdirSync,readFileSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Scan only emitted public artifacts; never print matching secret contents. */
export function inspectClientArtifacts(root,forbiddenValues=[]){
 const base=resolve(root),issues=[];let filesScanned=0;
 function walk(folder){
  for(const entry of readdirSync(folder,{withFileTypes:true})){
   const path=join(folder,entry.name),file=relative(base,path).replaceAll('\\','/');
   if(entry.isSymbolicLink())throw new Error('CLIENT_ARTIFACT_SYMLINK');
   if(entry.isDirectory()){walk(path);continue;}
   if(!entry.isFile())continue;
   filesScanned++;const source=readFileSync(path,'utf8');
   if(forbiddenValues.some(value=>typeof value==='string'&&value.length>=8&&source.includes(value)))issues.push({file,kind:'SERVER_SECRET'});
   if(/postgres(?:ql)?:\/\/[^\s"'<>]*:[^\s"'<>]*@/i.test(source)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)||/(?:sk_live_|sk-proj-|ghp_)[A-Za-z0-9_-]{20,}/.test(source))issues.push({file,kind:'DATABASE_CREDENTIAL'});
   if(/(?:[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]|\/(?:Users|home)\/[^/\s"']+\/)/.test(source))issues.push({file,kind:'LOCAL_PATH'});
  }
 }
 walk(base);if(filesScanned===0)throw new Error('CLIENT_ARTIFACTS_MISSING');
 return {filesScanned,issues};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length>3)throw new Error('INVALID_SCAN_ARGUMENT');
  const secrets=['DATABASE_URL','DEALTWIN_JUDGE_RESET_DATABASE_URL','DEALTWIN_JUDGE_SESSION_SIGNING_KEY','NEBIUS_API_KEY','CALLE_API_KEY','CALLE_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY'].map(key=>process.env[key]).filter(Boolean);
  const report=inspectClientArtifacts(process.argv[2]??'dist/client',secrets);
  console.log(JSON.stringify(report));if(report.issues.length)process.exitCode=1;
 }catch{console.error('CLIENT_ARTIFACT_SCAN_FAILED');process.exitCode=1;}
}
