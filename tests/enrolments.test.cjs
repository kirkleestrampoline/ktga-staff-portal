const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const loader=require('./load-typescript.cjs');
const model=loader()('lib/enrolments/model.ts');
const session={id:'session-a',class_profile_id:'profile-a',weekday:1,start_time:'16:00',finish_time:'17:00',venue_id:'venue-a',venue_name:'Synthetic venue',capacity:2,active:true,effective_from:null,effective_to:null,occupied_today:0,occupancy:[{enrolment_id:'first',start_date:'2026-09-01',end_date:'2026-09-30'},{enrolment_id:'second',start_date:'2026-10-01',end_date:null}]};
test('inclusive date overlap and capacity use selected recurrence periods',()=>{
 assert.equal(model.rangesOverlap('2026-09-30','2026-09-30','2026-09-30','2026-10-02'),true);
 assert.equal(model.rangesOverlap('2026-09-01','2026-09-29','2026-09-30',null),false);
 assert.equal(model.availableFor(session,'2026-09-15','2026-09-20'),1);
 assert.equal(model.availableFor(session,'2026-09-15',null),0);
 assert.equal(model.availableFor(session,'2026-09-15',null,'first'),1);
});
test('draft validation requires athlete, class, dates and at least one matching weekly recurrence',()=>{
 const valid={athlete_id:'athlete',class_profile_id:'profile-a',status:'active',start_date:'2026-09-17',end_date:'',source:'Member referral',internal_notes:'Internal',session_ids:['session-a'],change_from:'2026-09-17',override_reason:''};
 assert.equal(model.enrolmentError(valid,[session]),'');
 assert.match(model.enrolmentError({...valid,session_ids:[]},[session]),/at least one/);
 assert.match(model.enrolmentError({...valid,end_date:'2026-09-16'},[session]),/on or after/);
 assert.match(model.enrolmentError({...valid,session_ids:['other']},[session]),/unavailable/);
});
test('transport calls only the scoped read and idempotent command RPCs without caller club IDs',async()=>{
 const api=loader()('lib/enrolments/data.ts'),calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='enrolments_context'?{enrolments:[]}:{id:'enrolment'},error:null}}};
 await api.loadEnrolmentContext(client,'profile','athlete','  smith  ');await api.enrolmentCommand(client,'create',null,{athlete_id:'athlete'},'request');
 assert.deepEqual(calls,[{name:'enrolments_context',args:{p_profile_id:'profile',p_athlete_id:'athlete',p_search:'smith'}},{name:'enrolments_command',args:{p_action:'create',p_enrolment_id:null,p_data:{athlete_id:'athlete'},p_request_id:'request'}}]);
 assert.equal(JSON.stringify(calls).includes('club_id'),false);
});
const sql=fs.readFileSync('supabase/v1_8_0_enrolments_foundation.sql','utf8'),verify=fs.readFileSync('supabase/verify_v1_8_0_enrolments_foundation.sql','utf8');
function body(name){const match=sql.match(new RegExp('create function public\\.'+name+'\\([^]*?as \\$fn\\$([^]*?)\\$fn\\$;'));assert.ok(match,name);return match[1]}
test('schema uses tenant-composite restrictive links and keeps historical rows append-only',()=>{
 for(const constraint of ['enrolments_family_fk','enrolments_athlete_family_fk','enrolments_profile_fk','enrolment_session_parent_fk','enrolment_session_class_fk'])assert.ok(sql.includes(constraint),constraint);
 assert.match(sql,/foreign key\(club_id,family_id,athlete_id\) references public\.member_athletes\(club_id,family_id,id\) on delete restrict/);
 assert.match(sql,/foreign key\(club_id,class_profile_id,class_id\) references public\.classes\(club_id,class_profile_id,id\) on delete restrict/);
 assert.match(sql,/status in \('enquiry','trial','waiting','active','paused','ended'\)/);
 assert.match(sql,/Enrolments are historical records\. End them instead of deleting them/);assert.match(sql,/audit history is append only/);
 assert.doesNotMatch(sql,/on delete cascade/i);
});
test('tenant checks reject cross-club athlete, family, profile and recurrence identifiers',()=>{
 const command=body('enrolments_command'),context=body('enrolments_context');
 assert.match(command,/member_management_club\(\)/);assert.match(command,/member_athletes where id=.* and club_id=cid/);assert.match(command,/member_families where id=a\.family_id and club_id=cid/);assert.match(command,/class_profiles where id=.* and club_id=cid/);assert.match(command,/c\.club_id=cid and c\.class_profile_id=e\.class_profile_id/);
 assert.match(context,/Class outside club/);assert.match(context,/Athlete outside club/);
});
test('overlap, lifecycle and capacity checks are server-side and waiting does not consume places',()=>{
 const validate=body('enrolments_validate'),command=body('enrolments_command');
 assert.match(validate,/other\.status in \('active','trial','waiting'\)/);assert.match(validate,/daterange\(own\.selected_from/);
 assert.match(validate,/own\.selected_from as capacity_date/);assert.match(validate,/capacity_points\.capacity_date between os\.selected_from/);assert.doesNotMatch(validate,/selected_from day\b|point\.day\b/);
 const capacity=validate.slice(validate.indexOf("if e.status in ('active','trial') then"));assert.match(capacity,/other\.status in \('active','trial'\)/);assert.doesNotMatch(capacity,/other\.status in \('active','trial','waiting'\)/);
 assert.match(validate,/Capacity is full/);assert.match(validate,/p_override_reason/);assert.match(command,/capacity_override_reason/);
 assert.match(command,/p_action not in \('create','edit','status','end'\)/);assert.match(command,/superseded_at/);assert.match(command,/selected_to=.*change_on-1/);assert.match(command,/status='ended',end_date=end_on/);assert.match(command,/e\.status='ended'.*cannot be reopened/);
});
test('commands are transactional/idempotent and migration preserves unrelated operational rows',()=>{
 const command=body('enrolments_command');assert.match(command,/pg_advisory_xact_lock/);assert.match(command,/payload_hash<>digest/);assert.match(command,/return receipt\.result/);assert.match(sql,/enrolments_baseline/);
 for(const table of ['member_families','member_athletes','class_profiles','classes','scheduled_shifts','shifts','timesheets','invoices'])assert.ok(sql.includes(table),table);
 assert.doesNotMatch(command,/(?:insert into|update|delete from) public\.(?:scheduled_shifts|shifts|timesheets|invoices|class_profiles|classes|member_families|member_athletes)\b/i);
 assert.doesNotMatch(sql,/create or replace function public\.(?:generate_schedule_month|sync_class_schedule)/i);
});
test('read-only JSON verifier fingerprints every new function and contains no mutation statement',()=>{
 for(const name of ['enrolments_context','enrolments_command','enrolments_validate','enrolment_row_guard','enrolment_selection_guard','enrolment_append_only'])assert.ok(verify.includes(crypto.createHash('md5').update(body(name)).digest('hex')),name);
 assert.match(verify,/jsonb_build_object/);assert.match(verify,/'read_only',true/);assert.doesNotMatch(verify,/^\s*(insert|update|delete|alter|drop|create|grant|revoke)\b/im);
});
test('shared editor renders AV controls, recurrence capacity and explicit override reason',()=>{
 const context={today:'2026-09-17',counts:{active:0,trial:0,waiting:0},athletes:[{id:'athlete',family_id:'family',display_name:'Synthetic Athlete',family_name:'Synthetic Family',status:'active'}],profiles:[{id:'profile-a',name:'Recreational Gymnastics',active:true,publication_status:'published',capacity:2,start_date:null,end_date:null}],sessions:[{...session,capacity:1,occupancy:[{enrolment_id:'other',start_date:'2026-01-01',end_date:null}]}],enrolments:[]};
 const Form=loader({'@/lib/supabase/client':{createClient:()=>({})},'./enrolments.css':{}})('components/enrolments/enrolments-panel.tsx').EnrolmentForm;
 const html=renderToStaticMarkup(React.createElement(Form,{context,profileId:'profile-a',search:'',onSearch(){},onCancel(){},onSaved(){}}));
 for(const text of ['Find athlete','Weekly sessions attended','Synthetic venue','Capacity 1','0 available','Inclusive start date','Internal notes','Create enrolment'])assert.ok(html.includes(text),text);
 assert.match(html,/class="enrolment/);assert.doesNotMatch(html,/scheduled_shifts|attendance|billing|payment/i);
});
test('Classes and Member athlete surfaces both use the shared enrolments panel',()=>{
 const classes=fs.readFileSync('components/classes/classes-view.tsx','utf8'),member=fs.readFileSync('components/members/member-detail.tsx','utf8');
 assert.match(classes,/Roster/);assert.match(classes,/draft\.id&&canEdit/);assert.match(classes,/EnrolmentsPanel profileId=\{draft\.id\}/);assert.match(member,/EnrolmentsPanel athlete=/);assert.equal((classes.match(/EnrolmentsPanel/g)||[]).length>=2,true);
});
