const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const loader=require('./load-typescript.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const valid={club_id:id(1),profile_id:id(2),expected_role:'coach',confirmed:true};
function harness({actor=true,error=null}={}){
 const calls=[];
 const route=loader({
  '@/lib/platform-admin':{requirePlatformAdmin:async()=>actor?{user:{id:id(3)},profile:{role:'admin'}}:null},
  '@/lib/supabase/server':{createClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return {error}}})},
  '@supabase/supabase-js':{createClient:()=>{throw new Error('POST must not use service-role or Auth administration')}}
 })('app/api/platform-admin/club-owners/route.ts');
 return {route,calls};
}
const request=body=>({json:async()=>body});
test('unauthorised or inactive actor is rejected before any mutation client is used',async()=>{
 const h=harness({actor:false});assert.equal((await h.route.POST(request(valid))).status,403);assert.equal(h.calls.length,0);
});
for(const [name,change] of [['no confirmation',{confirmed:false}],['cross-purpose role assignment',{role:'admin'}],['bad target',{profile_id:'invalid'}],['Platform Admin role',{expected_role:'admin'}],['already an owner',{expected_role:'club_owner'}],['alter club ownership',{target_club_id:id(9)}]])test(`rejects ${name}`,async()=>{
 const h=harness();assert.equal((await h.route.POST(request({...valid,...change}))).status,400);assert.equal(h.calls.length,0);
});
test('promotion sends only the existing profile, target club and reviewed role to atomic RPC',async()=>{
 const h=harness();assert.equal((await h.route.POST(request(valid))).status,200);
 assert.deepEqual(h.calls,[{name:'platform_promote_club_owner',args:{p_club_id:valid.club_id,p_profile_id:valid.profile_id,p_expected_role:'coach'}}]);
});
for(const [code,status] of [['42501',403],['P0001',409],['23514',500]])test(`database refusal ${code} never reports successful promotion`,async()=>{
 const h=harness({error:{code,message:'private database diagnostic'}});const result=await h.route.POST(request(valid));assert.equal(result.status,status);assert.equal(JSON.stringify(await result.json()).includes('private database diagnostic'),false);
});
test('migration changes only profile role and inserts the minimal activity event',()=>{
 const sql=fs.readFileSync('supabase/v1_6_1_platform_owner_promotion.sql','utf8');
 const updates=[...sql.matchAll(/\bupdate\s+public\.(\w+)\s+set\s+([\s\S]*?)\s+where/gi)];
 assert.equal(updates.length,1);assert.equal(updates[0][1],'profiles');assert.equal(updates[0][2].trim(),"role='club_owner'");
 assert.deepEqual([...sql.matchAll(/\binsert\s+into\s+public\.(\w+)/gi)].map(m=>m[1]),['platform_activity']);
 assert.doesNotMatch(sql,/\b(delete\s+from|update\s+auth\.|insert\s+into\s+auth\.)/i);
 assert.match(sql,/to_jsonb\(after_target\)-'role'/);assert.match(sql,/to_jsonb\(target\)-'role'/);
 assert.match(sql,/target\.club_id is distinct from p_club_id/);assert.match(sql,/target\.role='admin'/);
 assert.match(sql,/p\.role='admin' and p\.is_active=true and c\.active=true/);
 assert.match(sql,/target\.is_active is distinct from true/);
 assert.match(sql,/jsonb_build_object\('previous_role',target.role,'new_role','club_owner'\)/);
 assert.doesNotMatch(sql,/perform public\.platform_promote_club_owner|select public\.platform_promote_club_owner/i);
});
test('browser errors omit debug in development and production while safe server logging remains',async()=>{
 const previous=process.env.NODE_ENV;
 const originalLog=console.error;
 const logs=[];
 console.error=(...args)=>logs.push(args);
 try{
  for(const environment of ['development','production']){
   process.env.NODE_ENV=environment;
   const h=harness({error:{code:'23514',message:'private database diagnostic',details:'private row contents',hint:'private hint'}});
   const response=await h.route.POST(request(valid));
   assert.equal(response.status,500);
   assert.deepEqual(await response.json(),{error:'Promotion could not be completed. No promotion was committed.'});
  }
  assert.equal(logs.length,2);
  for(const [label,diagnostic] of logs){
   assert.equal(label,'[platform-owner-promotion] RPC failed');
   assert.equal(diagnostic.code,'23514');
   for(const field of ['message','details','hint'])assert.equal(diagnostic[field],'[redacted: diagnostic may contain personal data]');
  }
 }finally{
  console.error=originalLog;
  if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;
 }
});
