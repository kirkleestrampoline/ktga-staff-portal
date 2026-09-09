// Isolated PostgreSQL runtime tests. Install @electric-sql/pglite outside the repository
// and set MEMBERS_TEST_PGLITE_PATH to its absolute package directory. Never uses Supabase.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const runtime=process.env.MEMBERS_TEST_PGLITE_PATH;
test('Members PostgreSQL tenant isolation, atomicity, duplicates, editing and archival',{skip:!runtime},async()=>{
 const {PGlite}=require(runtime);const db=new PGlite();
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table public.clubs(id uuid primary key,active boolean not null);
 create table public.profiles(id uuid primary key,club_id uuid references public.clubs(id),role text,is_active boolean);
 insert into public.clubs values('${id(1)}',true),('${id(2)}',true);
 insert into public.profiles values('${id(3)}','${id(1)}','club_owner',true),('${id(4)}','${id(2)}','org_admin',true),('${id(5)}','${id(1)}','admin',true),('${id(6)}','${id(1)}','coach',true);`);
 await db.exec(fs.readFileSync('supabase/v1_6_0_members_foundation.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/v1_6_3_members_internal_management.sql','utf8'));
 const actor=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated')};
 const read=async(search='',family=null)=>(await db.query('select public.member_directory($1,0,$2) result',[search,family])).rows[0].result;
 const mutate=async(action,fid,rid,stamp,data,ack=false)=>(await db.query('select public.member_manage($1,$2,$3,$4,$5::jsonb,$6) result',[action,fid,rid,stamp,JSON.stringify(data),ack])).rows[0].result;
 const athlete={first_name:'Sample',last_name:'Athlete',date_of_birth:'2010-01-01',gender:'',journey_status:'enquiry'};
 const contact={first_name:'Sample',last_name:'Contact',email:'sample@example.invalid',phone:'07700900123',relationship:'parent',is_primary:true,is_emergency:true,athlete_ids:[]};
 const payload={family:{display_name:'Sample family',status:'active'},contact,athletes:[athlete,{...athlete,first_name:'Second'}]};
 await actor(3);assert.deepEqual(await read(),{families:[],family_count:0,athlete_count:0,matched_families:0});
 for(const n of [5,6]){await actor(n);await assert.rejects(()=>read());await assert.rejects(()=>mutate('create_family',null,null,null,payload))}
 await actor(3);
 await assert.rejects(()=>mutate('create_family',null,null,null,{...payload,athletes:[athlete,{...athlete,date_of_birth:'2099-01-01'}]}));assert.equal((await read()).family_count,0);
 // Force a database failure after the family/contact/first athlete inserts.
 await db.exec(`reset role;create function public.fixture_failure() returns trigger language plpgsql as $$begin if new.first_name='Reject' then raise exception 'fixture failure'; end if; return new;end$$;
 create trigger fixture_failure before insert on public.member_athletes for each row execute function public.fixture_failure();`);
 await actor(3);await assert.rejects(()=>mutate('create_family',null,null,null,{...payload,athletes:[athlete,{...athlete,first_name:'Reject'}]}));assert.equal((await read()).family_count,0);
 const created=await mutate('create_family',null,null,null,payload);const fid=created.family_id;
 let family=(await read('',fid)).families[0];assert.equal(family.athletes.length,2);assert.equal(family.contacts.length,1);assert.equal(family.relationships.length,2);
 for(const query of ['Sample family','Sample Contact','sample@example.invalid','07700','Sample Athlete'])assert.equal((await read(query)).matched_families,1);
 for(const query of ['%','_','*'])assert.equal((await read(query)).matched_families,0);
 assert.equal((await mutate('create_family',null,null,null,payload)).requires_confirmation,true);assert.equal((await read()).family_count,1);
 await actor(4);assert.equal((await read('',fid)).families.length,0);
 await assert.rejects(()=>mutate('save_family',fid,fid,family.updated_at,{display_name:'Foreign',status:'active'}));
 assert.equal((await mutate('create_family',null,null,null,payload)).requires_confirmation,false); // No cross-club warning.
 await actor(3);
 await mutate('save_family',fid,fid,family.updated_at,{display_name:'Edited family',status:'active'});
 await assert.rejects(()=>mutate('save_family',fid,fid,family.updated_at,{display_name:'Stale',status:'active'}));
 family=(await read('',fid)).families[0];let a=family.athletes[0];
 await mutate('save_athlete',fid,a.id,a.updated_at,{...athlete,first_name:a.first_name,journey_status:'trial'});
 family=(await read('',fid)).families[0];a=family.athletes.find(x=>x.id===a.id);assert.equal(a.journey_status,'trial');
 for(const status of ['archived','active']){await mutate('set_status',fid,a.id,a.updated_at,{entity:'athlete',status});a=(await read('',fid)).families[0].athletes.find(x=>x.id===a.id);assert.equal(a.status,status)}
 let c=family.contacts[0];await mutate('save_contact',fid,c.id,c.updated_at,{...contact,email:'edited@example.invalid',athlete_ids:family.athletes.map(x=>x.id)});
 family=(await read('',fid)).families[0];assert.equal(family.contacts[0].email,'edited@example.invalid');
 await assert.rejects(()=>mutate('save_family',fid,fid,family.updated_at,{display_name:'Bad',status:'active',club_id:id(2)}));
 await db.exec(`reset role;update public.clubs set active=false where id='${id(1)}'`);await actor(3);await assert.rejects(()=>read());
 await db.exec(`reset role;update public.clubs set active=true where id='${id(1)}';update public.profiles set is_active=false where id='${id(3)}'`);await actor(3);await assert.rejects(()=>read());
 await db.exec('reset role');const verification=(await db.query(fs.readFileSync('supabase/verify_v1_6_3_members_internal_management.sql','utf8'))).rows[0].members_phase2_verification;assert.equal(verification.passed,true);
 }finally{await db.close()}
});
