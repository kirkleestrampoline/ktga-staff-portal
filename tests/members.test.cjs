const {test}=require('node:test');
const assert=require('node:assert/strict');
const loader=require('./load-typescript.cjs');
const {canReadMembers}=loader()('lib/members/access.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const club={id:id(1),active:true},actor={id:id(2),club_id:club.id,is_active:true,role:'club_owner'};
for(const role of ['club_owner','org_admin'])test(`${role} reads only their own active club`,()=>{
 assert.equal(canReadMembers(actor.id,{...actor,role},club,club.id),true);
 assert.equal(canReadMembers(actor.id,{...actor,role},club,id(3)),false);
});
for(const role of ['admin','coach','unknown'])test(`${role} has no member personal-data authority`,()=>assert.equal(canReadMembers(actor.id,{...actor,role},club,club.id),false));
test('missing identity, inactive account, mismatched profile and suspended club fail closed',()=>{
 assert.equal(canReadMembers(null,actor,club,club.id),false);
 assert.equal(canReadMembers(actor.id,null,club,club.id),false);
 assert.equal(canReadMembers(actor.id,actor,null,club.id),false);
 assert.equal(canReadMembers(id(8),actor,club,club.id),false);
 assert.equal(canReadMembers(actor.id,{...actor,is_active:false},club,club.id),false);
 assert.equal(canReadMembers(actor.id,actor,{...club,active:false},club.id),false);
});
function harness(role='club_owner'){
 const calls=[];
 const {loadMembers}=loader({'@/lib/security/account-access':{requireActiveAccount:async()=>({user:{id:actor.id},profile:{...actor,role},club})}})('lib/members/data.ts');
 const client={from(table){const call={table,filters:[]};calls.push(call);const q={select(columns,options){call.columns=columns;return q},eq(k,v){call.filters.push([k,v]);return q},ilike(k,v){call.search=[k,v];return q},order(){return q},limit(){return q},then(resolve){return Promise.resolve({data:[],count:0,error:null}).then(resolve)}};return q}};
 return {calls,client,loadMembers};
}
test('all list/count queries are scoped to the authenticated club, including supplied family IDs',async()=>{
 const h=harness();await h.loadMembers(h.client,'Smith','athletes',id(99));
 assert.equal(h.calls.length,3);
 for(const call of h.calls)assert.ok(call.filters.some(([k,v])=>k==='club_id'&&v===club.id));
 assert.ok(h.calls.find(call=>call.columns.includes("display_name")).filters.some(([k,v])=>k==='family_id'&&v===id(99)));
 assert.equal(h.calls.some(c=>/medical|auth_user|billing|email|phone/.test(c.columns)),false);
});
test('platform admins never issue member data or count requests',async()=>{
 const h=harness('admin');assert.deepEqual(await h.loadMembers(h.client,'','families',null),{restricted:true});assert.equal(h.calls.length,0);
});
test('literal percent and underscore searches cannot broaden account lookup',async()=>{
 const h=harness();await h.loadMembers(h.client,'A%_','families',null);assert.deepEqual(h.calls.find(call=>call.columns.includes("display_name")).search,['display_name','%A\\%\\_%']);
});
