const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const runtime=process.env.MEMBERS_TEST_PGLITE_PATH;
test('owner deletion is isolated, dependency protected, audited and atomic',{skip:!runtime},async()=>{
 const {PGlite}=require(runtime);const db=new PGlite();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table public.clubs(id uuid primary key,active boolean);create table public.profiles(id uuid primary key,club_id uuid references public.clubs(id),role text,is_active boolean);
 insert into public.clubs values('${id(1)}',true),('${id(2)}',true);
 insert into public.profiles values('${id(3)}','${id(1)}','club_owner',true),('${id(4)}','${id(1)}','org_admin',true),('${id(5)}','${id(1)}','admin',true),('${id(6)}','${id(1)}','coach',true),('${id(7)}','${id(2)}','club_owner',true);`);
 for(const f of ['v1_6_0_members_foundation.sql','v1_6_3_members_internal_management.sql','v1_6_4_members_experience_deletion.sql'])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec('set role authenticated')};
 const read=async()=>(await db.query("select public.member_directory_filtered('',0,null,'all','all') r")).rows[0].r;
 const del=async(fid,aid,name)=>(await db.query('select public.member_delete($1,$2,$3) r',[fid,aid,name])).rows[0].r;
 const create=async(name)=>{const payload={family:{display_name:name,status:'active'},contact:{first_name:'Test',last_name:'Contact',email:'',phone:'',relationship:'parent',is_primary:true,is_emergency:true,athlete_ids:[]},athletes:[{first_name:'One',last_name:'Athlete',date_of_birth:'2010-01-01',gender:'',journey_status:'trial'},{first_name:'Two',last_name:'Athlete',date_of_birth:'2011-01-01',gender:'',journey_status:'enquiry'}]};return (await db.query("select public.member_manage('create_family',null,null,null,$1,true) r",[JSON.stringify(payload)])).rows[0].r.family_id};
 await actor(3);const fid=await create('Deletion test');const other=await create('Preserve me');
 let family=(await read()).families.find(f=>f.id===fid);const aid=family.athletes[0].id;
 assert.equal((await db.query("select public.member_directory_filtered('',0,null,'archived','all','athletes') r")).rows[0].r.matched_families,0);
 assert.equal((await db.query("select public.member_directory_filtered('',0,null,'active','trial','athletes') r")).rows[0].r.matched_families,2);
 for(const n of [null,4,5,6,7]){await actor(n);await assert.rejects(()=>del(fid,null,'Deletion test'),e=>e.code==='42501')}
 await actor(3);await assert.rejects(()=>del(fid,null,'deletion test'),e=>e.code==='22023');
 // Explicitly test CASCADE references: deletion must never cascade into retention data.
 await db.exec(`reset role;create table public.retention_fixture(id uuid primary key,participant uuid references public.member_athletes(id) on delete cascade);insert into public.retention_fixture values('${id(10)}','${aid}')`);
 await actor(3);await assert.rejects(()=>del(fid,null,'Deletion test'),e=>e.code==='23503');await assert.rejects(()=>del(fid,aid,family.athletes[0].display_name),e=>e.code==='23503');
 await db.exec('reset role;drop table public.retention_fixture;create table public.unconstrained_fixture(athlete_id uuid)');await db.query('insert into public.unconstrained_fixture values($1)',[aid]);
 await actor(3);await assert.rejects(()=>del(fid,null,'Deletion test'),e=>e.code==='23503');await db.exec('reset role;drop table public.unconstrained_fixture');
 // Audit failure is after all deletions, so this proves complete rollback.
 await db.exec(`create function public.fail_audit() returns trigger language plpgsql as $$begin raise exception 'fixture audit failure';end$$;create trigger fail_audit before insert on public.member_deletion_activity for each row execute function public.fail_audit()`);
 await actor(3);await assert.rejects(()=>del(fid,null,'Deletion test'));assert.deepEqual((await read()).families.find(f=>f.id===fid),family);
 await db.exec('reset role;drop trigger fail_audit on public.member_deletion_activity');
 await actor(3);const removed=await del(fid,aid,family.athletes[0].display_name);assert.equal(removed.athletes,1);assert.equal(removed.contacts,0);
 family=(await read()).families.find(f=>f.id===fid);assert.equal(family.athletes.length,1);assert.equal(family.contacts.length,1);assert.equal(family.relationships.length,1);
 await assert.rejects(()=>del(fid,aid,'One Athlete')); // duplicate submission cannot repeat deletion
 const result=await del(fid,null,'Deletion test');assert.equal(result.families,1);assert.equal(result.contacts,1);assert.equal(result.athletes,1);
 assert.equal((await read()).families[0].id,other);assert.equal((await read()).families[0].athletes.length,2);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.member_deletion_activity')).rows[0].n,2);
 const verified=(await db.query(fs.readFileSync('supabase/verify_v1_6_4_members_experience_deletion.sql','utf8'))).rows[0].members_deletion_verification;assert.equal(verified.passed,true);
 await db.exec(`update public.clubs set active=false where id='${id(1)}'`);await actor(3);await assert.rejects(()=>del(other,null,'Preserve me'),e=>e.code==='42501');
 await db.exec(`reset role;update public.clubs set active=true where id='${id(1)}';update public.profiles set is_active=false where id='${id(3)}'`);await actor(3);await assert.rejects(()=>del(other,null,'Preserve me'),e=>e.code==='42501');
 }finally{await db.close()}
});
