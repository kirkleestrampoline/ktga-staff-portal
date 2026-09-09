const { test } = require('node:test');
const assert = require('node:assert/strict');
const loader = require('./load-typescript.cjs');
const load = loader();
const { activeAccount, canManageStaffTarget, canAssignStaffRole, launchResetEnabled } = load('lib/security/account-policy.ts');
const { requireActiveAccount, authoriseStaffTarget } = load('lib/security/account-access.ts');
const { exactInsensitivePattern } = load('lib/security/exact-match.ts');
const { resolvePortalAccount } = load('lib/portal-account.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const club = { id: id(1), active: true, slug: 'kirklees' };
const otherClub = { id: id(2), active: true, slug: 'greenhead' };
const actor = { id: id(3), role: 'club_owner', club_id: club.id, is_active: true };
const target = { id: id(4), role: 'coach', club_id: club.id, is_active: true, username: 'coach_one', auth_email: 'synthetic@login.avgymnastics.invalid', email: 'coach_one@example.com', contact_email: 'shared@example.com' };
const base = { userId: actor.id, actor, club, targetId: target.id, target };
const venue = { venue_id: id(5), club_id: club.id, is_admin: true };

for (const [name, changes, expected] of [
  ['same-club owner manages ordinary staff', {}, true],
  ['owner cannot target another club', {target:{...target,club_id:otherClub.id}}, false],
  ['owner cannot target Platform Admin', {target:{...target,role:'admin'}}, false],
  ['owner cannot target another owner', {target:{...target,role:'club_owner'}}, false],
  ['organisation administrator without assignments', {actor:{...actor,role:'org_admin'}}, false],
  ['organisation administrator with permitted assignments', {actor:{...actor,role:'org_admin'},actorVenues:[venue],targetVenues:[venue]}, true],
  ['organisation administrator has no positive admin relationship', {actor:{...actor,role:'org_admin'},actorVenues:[{...venue,is_admin:false}],targetVenues:[venue]}, false],
  ['organisation administrator cannot target unassigned staff', {actor:{...actor,role:'org_admin'},actorVenues:[venue]}, false],
  ['organisation administrator cannot target foreign venue', {actor:{...actor,role:'org_admin'},actorVenues:[venue],targetVenues:[{...venue,club_id:otherClub.id}]}, false],
  ['organisation administrator must manage all assignments', {actor:{...actor,role:'org_admin'},actorVenues:[venue],targetVenues:[venue,{...venue,venue_id:id(6)}]}, false],
  ['organisation administrator cannot manage another administrator', {actor:{...actor,role:'org_admin'},target:{...target,role:'org_admin'},actorVenues:[venue],targetVenues:[venue]}, false],
  ['suspended actor club', {club:{...club,active:false}}, false],
  ['inactive actor', {actor:{...actor,is_active:false}}, false],
  ['missing actor', {actor:null}, false],
  ['missing club', {club:null}, false],
  ['missing target', {target:null}, false],
  ['manipulated target ID', {targetId:id(99)}, false],
  ['malformed target ID', {targetId:'anything'}, false],
  ['session/profile mismatch', {userId:id(99)}, false],
  ['self management denied', {target:actor,targetId:actor.id}, false],
  ['Platform Admin ordinary workflow remains tenant scoped', {actor:{...actor,role:'admin'},target:{...target,club_id:otherClub.id}}, false],
  ['Platform Admin cannot reset another Platform Admin', {actor:{...actor,role:'admin'},target:{...target,role:'admin'}}, false],
]) test(name, () => assert.equal(canManageStaffTarget({...base,...changes}), expected));

test('protected roles cannot be assigned, including by Platform Admin staff tools', () => {
  for (const role of ['admin','club_owner','finance','',null]) for (const actorRole of ['admin','club_owner','org_admin']) assert.equal(canAssignStaffRole(actorRole,role),false);
  assert.equal(canAssignStaffRole('club_owner','org_admin'),true);
  assert.equal(canAssignStaffRole('org_admin','org_admin'),false);
});
test('launch reset defaults off and requires exactly true', () => {
  for (const value of [undefined,'','false','1','TRUE',' true ']) assert.equal(launchResetEnabled(value),false);
  assert.equal(launchResetEnabled('true'),true);
});

// A small in-memory query double evaluates escaped LIKE patterns, scopes and cardinality.
function client(tables, {userId=actor.id, failTable, mutations=[]}={}) {
  return {
    auth: {getUser:async()=>({data:{user:userId?{id:userId}:null},error:null}),admin:{
      updateUserById:async(...args)=>{mutations.push(['auth.update',...args]);return {error:null}},
      deleteUser:async(...args)=>{mutations.push(['auth.delete',...args]);return {error:null}},
    }},
    from(table) {
      let rows=[...(tables[table]||[])], single=false, operation=null;
      const query={
        select(){return query},
        eq(key,value){rows=rows.filter(row=>row[key]===value);return query},
        neq(key,value){rows=rows.filter(row=>row[key]!==value);return query},
        ilike(key,pattern){
          let regex='';
          const escape=c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          for(let i=0;i<pattern.length;i++){
            const c=pattern[i];
            if(c==='\\'&&i+1<pattern.length)regex+=escape(pattern[++i]);
            else regex+=c==='%'||c==='*'?'.*':c==='_'?'.':escape(c);
          }
          rows=rows.filter(row=>new RegExp(`^${regex}$`,'i').test(row[key]||''));return query;
        },
        limit(n){rows=rows.slice(0,n);return query},
        maybeSingle(){single=true;return query},single(){single=true;return query},
        update(values){operation=['update',table,values];return query},
        then(resolve,reject){
          if(operation)mutations.push([...operation,rows.map(r=>r.id)]);
          return Promise.resolve({data:single?(rows.length===1?rows[0]:null):rows,error:table===failTable?{code:'TEST_FAILURE'}:null}).then(resolve,reject);
        },
      };return query;
    },
  };
}
const tables=()=>({profiles:[actor,target],clubs:[club,otherClub],venues:[{id:venue.venue_id,club_id:club.id,active:true}],staff_venues:[]});
for(const condition of ['missing profile','inactive profile','missing club','suspended club','lookup error']) test(`active session rejected: ${condition}`,async()=>{
  const data=tables();
  if(condition==='missing profile')data.profiles=[];
  if(condition==='inactive profile')data.profiles=[{...actor,is_active:false}];
  if(condition==='missing club')data.clubs=[];
  if(condition==='suspended club')data.clubs=[{...club,active:false}];
  assert.equal(await requireActiveAccount(client(data,{failTable:condition==='lookup error'?'clubs':undefined})),null);
});
test('server target lookup rejects manipulated foreign ID before mutation',async()=>{
  const data=tables();data.profiles.push({...target,id:id(9),club_id:otherClub.id});
  assert.equal(await authoriseStaffTarget(client(data),{user:{id:actor.id},profile:actor,club},id(9)),null);
});
test('venue lookup failures deny authority',async()=>{
  const data=tables();data.staff_venues=[{profile_id:actor.id,venue_id:venue.venue_id,is_admin:true},{profile_id:target.id,venue_id:venue.venue_id,is_admin:false}];
  const a={user:{id:actor.id},profile:{...actor,role:'org_admin'},club};
  assert.equal((await authoriseStaffTarget(client(data),a,target.id)).id,target.id);
  assert.equal(await authoriseStaffTarget(client(data,{failTable:'venues'}),a,target.id),null);
});

test('exact normalisation escapes percent, underscore and backslash',()=>{
  assert.equal(exactInsensitivePattern(' Coach_One '),'coach\\_one');
  assert.equal(exactInsensitivePattern('a%b\\c'),'a\\%b\\\\c');
  assert.equal(exactInsensitivePattern('*'),null);
});
for(const [identifier,code] of [['coach%',''],['coach_one','kirk%'],['coach_one','kirklees_'],['coach_one','*'],['*',''],['%@example.com',''],['coach_one@%.com','']]) test(`wildcard lookup cannot broaden: ${identifier} / ${code}`,async()=>{
  assert.equal((await resolvePortalAccount(client(tables()),identifier,code,{allowEmail:true})).status,'not_found');
});
test('literal underscore does not match arbitrary characters; email compatibility retained',async()=>{
  const data=tables();data.profiles.push({...target,id:id(8),username:'coachXone',email:'coachXone@example.com',auth_email:'different@login.avgymnastics.invalid',contact_email:null});
  assert.equal((await resolvePortalAccount(client(data),' COACH_ONE ',' KIRKLEES ')).profile.id,target.id);
  assert.equal((await resolvePortalAccount(client(data),'COACH_ONE@EXAMPLE.COM','',{allowEmail:true})).profile.id,target.id);
  assert.equal((await resolvePortalAccount(client(data),target.auth_email,'',{allowEmail:true})).profile.id,target.id);
});
test('tenant username and shared-email ambiguity are preserved',async()=>{
  const data=tables();data.profiles.push({...target,id:id(8),club_id:otherClub.id});
  assert.equal((await resolvePortalAccount(client(data),'coach_one','')).status,'ambiguous');
  assert.equal((await resolvePortalAccount(client(data),'coach_one','greenhead')).profile.id,id(8));
  assert.equal((await resolvePortalAccount(client(data),'shared@example.com','',{allowEmail:true})).status,'ambiguous');
  assert.equal((await resolvePortalAccount(client(data),'shared@example.com','kirklees',{allowEmail:true})).profile.id,target.id);
});

function routes(data, mutations) {
  const db=client(data,{mutations});
  return loader({'@/lib/supabase/server':{createClient:async()=>db},'@supabase/supabase-js':{createClient:()=>db}});
}
const request=body=>({json:async()=>body});
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.invalid';
process.env.SUPABASE_SECRET_KEY='test-only-placeholder';
for(const action of ['set_password','update_identity','set_contact_email','update_access']) for(const foreign of [false,true]) test(`${action} rejects ${foreign?'foreign staff':'Platform Admin'} without mutations`,async()=>{
  const data=tables(),mutations=[];data.profiles[1]={...target,...(foreign?{club_id:otherClub.id}:{role:'admin'})};
  const route=routes(data,mutations)('app/api/staff-access/route.ts');
  const response=await route.POST(request({action,profile_id:target.id,password:'long-password',username:'coach',email:'safe@example.com',is_active:false}));
  assert.equal(response.status,403);assert.deepEqual(mutations,[]);
});
for(const routePath of ['staff-access','admin-user','account-email']) for(const condition of ['inactive','suspended','missing profile','missing club']) test(`${routePath} blocks existing session: ${condition}`,async()=>{
  const data=tables(),mutations=[];
  if(condition==='inactive')data.profiles[0]={...actor,is_active:false};
  if(condition==='suspended')data.clubs[0]={...club,active:false};
  if(condition==='missing profile')data.profiles=data.profiles.slice(1);
  if(condition==='missing club')data.clubs=[];
  const response=await routes(data,mutations)(`app/api/${routePath}/route.ts`).POST(request({action:'delete',user_id:target.id,email:'x@example.com'}));
  assert.equal(response.status,403);assert.deepEqual(mutations,[]);
});
test('authorised password mutation uses verified target',async()=>{
  const mutations=[];
  const response=await routes(tables(),mutations)('app/api/staff-access/route.ts').POST(request({action:'set_password',profile_id:target.id,password:'long-password'}));
  assert.equal(response.status,200);assert.equal(mutations[0][0],'auth.update');assert.equal(mutations[0][1],target.id);
});
test('manipulated role request causes no writes',async()=>{
  for(const action of ['update_access','create_account','set_password']){
    const mutations=[];
    const response=await routes(tables(),mutations)('app/api/staff-access/route.ts').POST(request({action,profile_id:target.id,role:'admin'}));
    assert.ok(response.status>=400);assert.deepEqual(mutations,[]);
  }
});
test('launch reset disabled before session lookup, request parsing or mutations',async()=>{
  const previous=process.env.ENABLE_LAUNCH_RESET;
  try{
    for(const flag of [undefined,'false']){
      if(flag===undefined)delete process.env.ENABLE_LAUNCH_RESET;else process.env.ENABLE_LAUNCH_RESET=flag;
      const route=loader({'@/lib/platform-admin':{requirePlatformAdmin:()=>{throw Error('must not authenticate')}},'@supabase/supabase-js':{createClient:()=>{throw Error('must not create service client')}}})('app/api/launch-reset/route.ts');
      const response=await route.POST({json:()=>{throw Error('must not parse body')}});
      assert.equal(response.status,403);assert.equal((await response.json()).code,'FEATURE_DISABLED');
    }
  }finally{if(previous===undefined)delete process.env.ENABLE_LAUNCH_RESET;else process.env.ENABLE_LAUNCH_RESET=previous}
});

for(const kind of ['Platform Admin','foreign','missing','malformed','self']) test(`deletion rejects ${kind} target without Auth mutation`,async()=>{
  const data=tables(),mutations=[];
  if(kind==='Platform Admin')data.profiles[1]={...target,role:'admin'};
  if(kind==='foreign')data.profiles[1]={...target,club_id:otherClub.id};
  if(kind==='missing')data.profiles=data.profiles.slice(0,1);
  const targetId=kind==='malformed'?'malformed':kind==='self'?actor.id:target.id;
  const response=await routes(data,mutations)('app/api/admin-user/route.ts').POST(request({action:'delete',user_id:targetId}));
  assert.equal(response.status,403);assert.deepEqual(mutations,[]);
});
test('same-club deletion authorises the target before Auth deletion',async()=>{
  const mutations=[];
  const response=await routes(tables(),mutations)('app/api/admin-user/route.ts').POST(request({action:'delete',user_id:target.id}));
  assert.equal(response.status,200);assert.deepEqual(mutations,[['auth.delete',target.id]]);
});
test('access update permits deactivation and ordinary role changes only',async()=>{
  const mutations=[];
  const response=await routes(tables(),mutations)('app/api/staff-access/route.ts').POST(request({action:'update_access',profile_id:target.id,role:'org_admin',is_active:false,force_password_reset:true,auth_email:'ignored@example.com'}));
  assert.equal(response.status,200);
  assert.deepEqual(mutations,[['update','profiles',{role:'org_admin',is_active:false,force_password_reset:true},[target.id]]]);
});
for(const action of ['set_password','update_identity','set_contact_email','update_access']) test(`${action} denies empty organisation authority at route boundary`,async()=>{
  const data=tables(),mutations=[];data.profiles[0]={...actor,role:'org_admin'};
  const response=await routes(data,mutations)('app/api/staff-access/route.ts').POST(request({action,profile_id:target.id,password:'long-password'}));
  assert.equal(response.status,403);assert.deepEqual(mutations,[]);
});
for(const condition of ['inactive','suspended','missing profile','missing club']) test(`Platform Admin guard rejects ${condition}`,async()=>{
  const data=tables();data.profiles[0]={...actor,role:'admin',is_active:condition!=='inactive'};
  if(condition==='suspended')data.clubs[0]={...club,active:false};
  if(condition==='missing profile')data.profiles=[];
  if(condition==='missing club')data.clubs=[];
  assert.equal(await routes(data,[])('lib/platform-admin.ts').requirePlatformAdmin(),null);
});
for(const condition of ['inactive','suspended','missing profile','missing club']) test(`dashboard rejects ${condition} existing session`,async()=>{
  const data=tables();
  if(condition==='inactive')data.profiles[0]={...actor,is_active:false};
  if(condition==='suspended')data.clubs[0]={...club,active:false};
  if(condition==='missing profile')data.profiles=[];
  if(condition==='missing club')data.clubs=[];
  const page=loader({'@/lib/supabase/server':{createClient:async()=>client(data)},'next/navigation':{redirect:path=>{throw new Error(`redirect:${path}`)}},'./ui':{default:()=>null}})('app/dashboard/page.tsx').default;
  await assert.rejects(page({searchParams:Promise.resolve({})}),/redirect:/);
});
for(const condition of ['inactive','suspended','missing club']) for(const endpoint of ['login','password-reset']) test(`${endpoint} refuses ${condition} account before Auth operations`,async()=>{
  const data=tables(),mutations=[];
  if(condition==='inactive')data.profiles[1]={...target,is_active:false};
  if(condition==='suspended')data.clubs[0]={...club,active:false};
  if(condition==='missing club')data.clubs=[];
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-only-publishable';
  const response=await routes(data,mutations)(`app/api/${endpoint}/route.ts`).POST({json:async()=>({identifier:target.username,password:'long-password',action:'verify_and_change',token:'12345678'}),headers:{get:()=>null}});
  assert.ok(response.status>=400);assert.deepEqual(mutations,[]);
});
