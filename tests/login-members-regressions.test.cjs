const {test}=require('node:test');
const assert=require('node:assert/strict');
const loader=require('./load-typescript.cjs');
const diagnostic=loader()('lib/security/lookup-diagnostic.ts');
test('lookup diagnostics preserve status and stage without upstream personal data',()=>{
 assert.deepEqual(diagnostic.lookupDiagnostic('club_code',{code:'',message:'TypeError: fetch failed secret@example.invalid'},0),{stage:'club_code',code:'UNCLASSIFIED',http_status:0,category:'transport'});
 assert.equal(diagnostic.transportCode({cause:{code:'ECONNRESET',message:'private'}}),'ECONNRESET');
 assert.equal(diagnostic.transportCode({code:'private-value'}),'UNKNOWN_TRANSPORT_ERROR');
});
test('first lookup failure stays 503, never authenticates or retries, and logs diagnostic',async()=>{
 const logs=[];let calls=0;
 const query={select(){return this},ilike(){return this},limit(){return this},then(resolve){calls++;resolve({data:null,error:{code:'',message:'TypeError: fetch failed'},status:0})}};
 const route=loader({'@supabase/supabase-js':{createClient:()=>({from:()=>query})},'@/lib/supabase/server':{createClient:()=>{throw Error('must not authenticate')}}})('app/api/login/route.ts');
 const previous=[process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY];
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SECRET_KEY='test';
 const original=console.error;console.error=(...args)=>logs.push(args);
 try{
  const response=await route.POST({json:async()=>({identifier:'test',club_code:'club',password:'test'})});
  assert.equal(response.status,503);assert.equal(calls,1);
  assert.deepEqual(await response.json(),{error:'Sign-in is temporarily unavailable'});
  assert.equal(logs[0][1].stage,'club_code');assert.equal(logs[0][1].http_status,0);
 }finally{console.error=original;for(const [i,key] of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY'].entries()){if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}}
});
test('missing Members RPC is a deployment error, never a zero-record success; empty installed RPC succeeds',async()=>{
 const api=loader({'@/lib/security/account-access':{requireActiveAccount:async()=>({user:{id:'00000000-0000-4000-8000-000000000001'},profile:{id:'00000000-0000-4000-8000-000000000001',role:'club_owner',club_id:'00000000-0000-4000-8000-000000000002',is_active:true},club:{id:'00000000-0000-4000-8000-000000000002',active:true}})}})('lib/members/management.ts');
 const original=console.error;const logs=[];console.error=(...args)=>logs.push(args);
 try{
  await assert.rejects(api.readMemberDirectory({rpc:async()=>({data:null,status:404,error:{code:'PGRST202',message:'private payload'}})}),/migration and schema cache/);
  assert.deepEqual(logs[0][1],{stage:'member_directory',code:'PGRST202',http_status:404,category:'upstream'});
  const empty={families:[],family_count:0,athlete_count:0,matched_families:0};
  assert.deepEqual(await api.readMemberDirectory({rpc:async()=>({data:empty,error:null,status:200})}),empty);
 }finally{console.error=original;}
});
