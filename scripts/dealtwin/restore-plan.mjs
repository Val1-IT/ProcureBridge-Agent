import {existsSync,lstatSync,readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Preparation only. Deliberately no subprocess, network, write or cleanup API.
function rejectRedirects(target) {
 for(let current=path.resolve(target);;current=path.dirname(current)){
  try{if(lstatSync(current).isSymbolicLink())throw new Error('REDIRECTED_PATH');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(path.dirname(current)===current)break;
 }
}
function contained(root,target) {
 const relative=path.relative(root,target);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('PATH_OUTSIDE_WORKSPACE');
 rejectRedirects(target);
 return target;
}
export function planWindowsRestore(workspace,runId,binaryDirectory='C:\\Program Files\\PostgreSQL\\15\\bin') {
 if(process.platform!=='win32')throw new Error('WINDOWS_REQUIRED');
 if(typeof runId!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(runId))throw new Error('INVALID_RUN_ID');
 if(typeof workspace!=='string'||!path.isAbsolute(workspace)||workspace.startsWith('\\\\'))throw new Error('LOCAL_WORKSPACE_REQUIRED');
 rejectRedirects(workspace);
 const root=realpathSync(workspace);
 const source=contained(root,path.join(root,'.cache','pg-browser-20261018'));
 const version=contained(root,path.join(source,'PG_VERSION'));
 if(!existsSync(version)||!lstatSync(version).isFile())throw new Error('SOURCE_REQUIRED');
 if(readFileSync(version,'utf8').trim()!=='15')throw new Error('SOURCE_MAJOR_MISMATCH');
 const target=contained(root,path.join(root,'.cache','pg-restore-'+runId));
 const evidence=contained(root,path.join(root,'output','restore-'+runId));
 const marker=contained(root,target+'.owner.json');
 for(const destination of [target,evidence,marker])if(existsSync(destination))throw new Error('DESTINATION_EXISTS');
 const binaries={};
 for(const name of ['initdb','pg_ctl','pg_dump','pg_restore','createdb','psql']){
  const filename=path.resolve(binaryDirectory,name+'.exe');rejectRedirects(filename);
  if(!existsSync(filename)||!lstatSync(filename).isFile())throw new Error('BINARY_REQUIRED:'+name);
  binaries[name]={path:filename,sha256:createHash('sha256').update(readFileSync(filename)).digest('hex')};
 }
 const dump=path.join(evidence,'source.dump');
 const command=(id,tool,args)=>({id,executable:binaries[tool].path,args});
 return {
  schemaVersion:'dealtwin.restore-plan.v1',executionAuthorized:false,workspace:root,runId,
  source:{host:'127.0.0.1',port:55632,database:'dealtwin_test',dataDirectory:source,major:15},
  target:{host:'127.0.0.1',port:55432,database:'dealtwin_test',dataDirectory:target,major:15},
  evidenceDirectory:evidence,binaries,
  ownership:{ownerMarker:marker,established:false,rule:'An authorized runner must create new paths exclusively and bind cluster identity/PID before any mutation or cleanup.'},
  listenerAvailability:'NOT_CHECKED',
  pending:['AUTHORIZE_NEW_DISPOSABLE_FIXTURE','VERIFY_SOURCE_IDENTITY_AND_SNAPSHOT','VERIFY_TARGET_PORT_UNUSED','VERIFY_BINARY_MAJOR_AND_HASHES','CREATE_EXCLUSIVE_OWNER_RECORD','PREPARE_SYNTHETIC_AUTH_WITHOUT_LOGGING','PORT_TARGET_ROLE_AND_RESTORE_ASSERTIONS_TO_WINDOWS'],
  commands:[
   command('source-status','pg_ctl',['status','-D',source]),
   command('source-dump','pg_dump',['--host','127.0.0.1','--port','55632','--username','dealtwin','--format=custom','--file',dump,'dealtwin_test']),
   command('target-init','initdb',['-D',target,'-U','dealtwin','--auth-local=scram-sha-256','--auth-host=scram-sha-256','--pwfile',path.join(evidence,'synthetic-owner-password')]),
   command('target-start','pg_ctl',['start','-D',target,'-o','-h 127.0.0.1 -p 55432','-l',path.join(evidence,'target-postgres.log'),'-w']),
   command('target-create-database','createdb',['--host','127.0.0.1','--port','55432','--username','dealtwin','--owner','dealtwin','dealtwin_test']),
   // Target roles/schema assertions are a pending stage, not hidden SQL here.
   command('restore','pg_restore',['--host','127.0.0.1','--port','55432','--username','dealtwin','--dbname','dealtwin_test','--exit-on-error','--single-transaction',dump]),
   command('target-stop','pg_ctl',['stop','-D',target,'-m','fast','-w']),
  ],
  automaticCleanup:[],
  warning:'Command descriptions are incomplete until pending checks and authorization are satisfied. Never run restore against the source or infer ownership from a matching port.'
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--run-id')throw new Error('Usage: restore-plan.mjs --run-id <id> (read-only)');
 const root=fileURLToPath(new URL('../../',import.meta.url));
 console.log(JSON.stringify(planWindowsRestore(root,args[1]),null,2));
}
