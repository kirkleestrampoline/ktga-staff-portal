const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const runtime=process.env.MEMBERS_TEST_PGLITE_PATH;
test('Members essentials preserve privacy, tenant isolation, history and deletion safeguards',{skip:!runtime},async()=>{
 const {PGlite}=require(runtime);const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.clubs(id uuid primary key,active boolean);create table public.profiles(id uuid primary key,club_id uuid references public.clubs(id),role text,is_active boolean);
 insert into public.clubs values('${id(1)}',true),('${id(2)}',true);
 insert into public.profiles values('${id(3)}','${id(1)}','club_owner',true),('${id(4)}','${id(1)}','org_admin',true),('${id(5)}','${id(1)}','admin',true),('${id(6)}','${id(1)}','coach',true),('${id(7)}','${id(2)}','club_owner',true);`);
 for(const f of ['v1_6_0_members_foundation.sql','v1_6_3_members_internal_management.sql','v1_6_4_members_experience_deletion.sql','v1_6_5_members_finishing.sql'])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec('set role authenticated')};
 await actor(3);
 const payload={family:{display_name:'Private family',status:'active'},contact:{first_name:'First',last_name:'Contact',email:'',phone:'',relationship:'parent',is_primary:true,is_emergency:true,athlete_ids:[]},athletes:[{first_name:'First',last_name:'Athlete',date_of_birth:'2010-01-01',gender:'',journey_status:'active'}]};
 const fid=(await db.query("select public.member_manage('create_family',null,null,null,$1,true) r",[JSON.stringify(payload)])).rows[0].r.family_id;
 const call=async(action='read',rid=null,data={},stamp=null)=>(await db.query('select public.member_essentials($1,$2,$3,$4,$5) r',[fid,action,rid,JSON.stringify(data),stamp])).rows[0].r;
 let d=await call();assert.equal(d.contacts[0].portal_status,'not_invited');assert.ok(d.activity.length>=3);
 for(const n of [null,5,6,7]){await actor(n);await assert.rejects(()=>call(),e=>e.code==='42501')}
 await actor(4);d=await call(); // same-club organisation administrator allowed
 await call('address',null,{address:'Internal address'},d.updated_at);d=await call();assert.equal(d.address,'Internal address');
 let a=d.athletes[0],c=d.contacts[0];
 await call('medical',a.id,{medical_notes:'PRIVATE HEALTH',allergies:'PRIVATE ALLERGY'},a.updated_at);
 await assert.rejects(()=>call('medical',a.id,{medical_notes:'stale',allergies:''},a.updated_at),e=>e.code==='40001');
 await call('preferences',c.id,{email:true,sms:false,marketing:null},c.updated_at);
 await assert.rejects(()=>call('preferences',c.id,{email:true,sms:false,marketing:false,portal_status:'active'},c.updated_at),e=>e.code==='22023');
 await call('note',a.id,{body:'PRIVATE NOTE'});d=await call();assert.equal(d.notes.length,1);assert.equal(d.athletes[0].allergies,'PRIVATE ALLERGY');assert.equal(d.contacts[0].preferences.email,true);
 assert.doesNotMatch(JSON.stringify(d.activity),/PRIVATE|Internal address/);
 const directory=(await db.query("select public.member_directory_filtered('',0,null,'all','all','families') r")).rows[0].r;assert.doesNotMatch(JSON.stringify(directory),/PRIVATE HEALTH|PRIVATE ALLERGY|PRIVATE NOTE/);
 await actor(3);await assert.rejects(()=>db.query('select public.member_delete($1,null,$2)',[fid,'Private family']),e=>e.code==='23503');
 await db.exec('reset role');assert.equal((await db.query(fs.readFileSync('supabase/verify_v1_6_5_members_finishing.sql','utf8'))).rows[0].members_finishing_verification.passed,true);
 }finally{await db.close()}
});
