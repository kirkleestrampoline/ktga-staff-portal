const {test}=require('node:test');
const assert=require('node:assert/strict');
const loader=require('./load-typescript.cjs');
const model=loader()('lib/members/model.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const athlete={...model.newAthlete(),first_name:'Test',last_name:'Athlete',date_of_birth:'2010-05-03'};
const contact={...model.newContact(),first_name:'Test',last_name:'Guardian',email:'test@example.invalid',phone:'07700900123'};
test('atomic creation validates all athletes before submission',()=>{
 assert.equal(model.creationError({display_name:'Test family',status:'active'},contact,[athlete]),'');
 assert.ok(model.creationError({display_name:'Test family',status:'active'},contact,[]));
 assert.ok(model.creationError({display_name:'Test family',status:'active'},contact,[athlete,{...athlete,date_of_birth:'2099-01-01'}]));
 assert.ok(model.athleteError({...athlete,date_of_birth:'2025-02-30'}));
});
test('journey statuses are independent of archive state and ages respect birthdays',()=>{
 for(const journey_status of model.journeys)assert.equal(model.athleteError({...athlete,journey_status}),'');
 assert.equal(model.ageAt('2000-09-10','2026-09-09'),25);assert.equal(model.ageAt('2000-09-10','2026-09-10'),26);
 assert.equal(model.phoneKey('+44 7700 900123'),model.phoneKey('07700 900123'));
});
function harness(role='club_owner',clubId=id(1),result={families:[],family_count:0,athlete_count:0,matched_families:0}){
 const calls=[];
 const api=loader({'@/lib/security/account-access':{requireActiveAccount:async()=>({user:{id:id(3)},profile:{id:id(3),club_id:clubId,is_active:true,role},club:{id:clubId,active:true}})}})('lib/members/management.ts');
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null}}};
 return {api,client,calls};
}
for(const role of ['admin','coach'])test(`${role} cannot invoke member reads or writes`,async()=>{
 const h=harness(role);assert.equal(await h.api.readMemberDirectory(h.client),null);
 await assert.rejects(()=>h.api.manageMember(h.client,{action:'save_family',data:{}}),/not authorised/);assert.equal(h.calls.length,0);
});
for(const [clubName,clubId] of [['Kirklees',id(1)],['Greenhead',id(2)]])for(const role of ['club_owner','org_admin'])test(`${clubName} ${role} uses authenticated RPC with no caller-supplied tenant`,async()=>{
 const h=harness(role,clubId);const result=await h.api.readMemberDirectory(h.client,'a%_*',0,id(8));
 assert.deepEqual(result,{families:[],family_count:0,athlete_count:0,matched_families:0});
 assert.deepEqual(h.calls[0],{name:'member_directory',args:{p_search:'a%_*',p_offset:0,p_family_id:id(8)}});
});
test('editing and archive/reactivation preserve record identity and carry concurrency token',async()=>{
 const h=harness();
 for(const action of ['save_family','save_contact','save_athlete','set_status'])for(const status of ['active','archived']){
  await h.api.manageMember(h.client,{action,familyId:id(4),recordId:id(5),updatedAt:'2026-01-01T00:00:00Z',data:{status}});
  const args=h.calls.at(-1).args;assert.equal(args.p_record_id,id(5));assert.equal(args.p_family_id,id(4));assert.equal(args.p_expected_updated_at,'2026-01-01T00:00:00Z');assert.equal(args.p_ack_duplicates,false);
 }
});
test('duplicate warning is not success and acknowledgement must be explicit',async()=>{
 const warning={requires_confirmation:true,warnings:['Possible duplicate in this club']};const h=harness('club_owner',id(1),warning);
 assert.deepEqual(await h.api.manageMember(h.client,{action:'create_family',data:{}}),warning);assert.equal(h.calls[0].args.p_ack_duplicates,false);
 await h.api.manageMember(h.client,{action:'create_family',data:{}},true);assert.equal(h.calls[1].args.p_ack_duplicates,true);
});
