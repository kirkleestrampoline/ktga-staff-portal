const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react');
const load=require('./load-typescript.cjs')();
test('Staff Rota cold load waits for staff and admin month cost dependencies',()=>{
 const source=fs.readFileSync('app/dashboard/ui.tsx','utf8');
 const scheduleBranch=source.slice(source.indexOf('  async function loadTabData'),source.indexOf('  async function reloadLoadedTab'));
 assert.match(scheduleBranch,/loadSchedule\(\).*runSharedDataLoad\("staff",loadStaff\).*loadAdmin\(true\)/s);
 assert.match(source,/adminCostStatus==="ready"\?money\(actualScheduleCost\):adminCostStatus==="error"\?"Unavailable":"Loading…"/);
});
const {earlierFinish,resetActualTimes,validateActualTimes,confirmActualBatch}=load('lib/timesheet-actual.ts');
const planned={start:'16:00',finish:'18:00',breakMinutes:10};
test('quick choices calculate from scheduled end and preserve explicitly edited start; reset copies schedule',()=>{
 const actual={...planned,start:'16:15'};
 for(const n of [5,10,15,30,22]){const result=earlierFinish(earlierFinish(actual,planned,5),planned,n);assert.equal(result.start,'16:15');assert.equal(result.finish,`17:${60-n}`)}
 assert.deepEqual(resetActualTimes(planned),planned);assert.notEqual(resetActualTimes(planned),planned);
 assert.throws(()=>earlierFinish(actual,planned,120));assert.throws(()=>earlierFinish({...actual,start:'17:50'},planned,15));
 assert.equal(earlierFinish({start:'22:15',finish:'00:10',breakMinutes:0},{start:'22:00',finish:'00:10',breakMinutes:0},30).finish,'23:40');
});
test('validation matches RPC time/break/overnight rules without defaulting invalid input',()=>{
 for(const patch of [{finish:''},{start:'25:00'},{finish:'16:00'},{breakMinutes:120},{breakMinutes:-1},{breakMinutes:NaN}])assert.ok(validateActualTimes({...planned,...patch}));
 assert.equal(validateActualTimes({start:'22:00',finish:'02:00',breakMinutes:30}),null);
});
test('mixed batch records every outcome, passes exact actual payload and retries only failed IDs',async()=>{
 const calls=[];const items=['a','b','c'].map(id=>({id,planned,actual:{...planned,start:'16:15',finish:id==='c'?'':'17:30'}}));
 const first=await confirmActualBatch(items,true,async r=>{calls.push(r);if(r.args.p_scheduled_id==='b')throw Error('Month locked')});
 assert.deepEqual(first.succeeded,['a']);assert.deepEqual(Object.keys(first.failed),['b','c']);assert.equal(calls.length,2);assert.deepEqual(calls[0].args,{p_scheduled_id:'a',p_start_time:'16:15',p_finish_time:'17:30',p_break_minutes:10});
 const retry=await confirmActualBatch(items.filter(i=>first.failed[i.id]).map(i=>({...i,actual:{...planned,finish:'17:30'}})),true,async r=>calls.push(r));assert.deepEqual(retry.succeeded,['b','c']);assert.equal(calls.filter(r=>r.args.p_scheduled_id==='a').length,1);
});
test('actual cards default to as scheduled and show explicit adjustment controls when opened',()=>{
 const {renderToStaticMarkup}=require('react-dom/server');const props={staff:'Synthetic Coach',className:'Synthetic class',planned,actual:planned,selected:true,disabled:false,onSelect(){},onChange(){}};
 const Card=load('components/actual-time-card.tsx').default;const html=renderToStaticMarkup(React.createElement(Card,props));assert.match(html,/As scheduled/);assert.match(html,/Synthetic Coach/);assert.doesNotMatch(html,/type="time"/);
 let state=0;const Expanded=require('./load-typescript.cjs')({react:{...React,useState:v=>[state++===0?true:v,()=>{}]}})('components/actual-time-card.tsx').default;const expanded=renderToStaticMarkup(React.createElement(Expanded,props));for(const label of ['Actual start','Actual end','Reset to scheduled','Custom minutes earlier','Finished 30 min earlier'])assert.ok(expanded.includes(label));
});
test('linked shift class access stays in place and is hidden for one-offs/non-admins',()=>{
 const source=fs.readFileSync('app/dashboard/ui.tsx','utf8');const section=source.slice(source.indexOf('  function LinkedClassAction'),source.indexOf('  function AdminScheduleShiftModal'));
 assert.match(section,/isAdmin&&linked/);assert.match(section,/c.id===shift.class_id&&c.class_profile_id/);assert.doesNotMatch(section,/setTab|setAdminScheduleShift/);
 assert.equal((source.match(/LinkedClassAction\(\{shift:s\}\)/g)||[]).length,3);assert.ok(source.includes('LinkedClassAction({shift})'));assert.ok(source.includes('LinkedClassAction({shift:assignment.shift})'));assert.ok(source.includes('if(document.querySelector("dialog[open]"))return;'));
 assert.match(source,/if\(!dailyConfirmation\|\|dailyFlight.current\)return/);assert.match(source,/!review.succeeded\?\.includes\(shift.id\)/);
});
test('confirmation controller blocks concurrent submissions and retains only failed shifts for retry',async()=>{
 const source=fs.readFileSync('app/dashboard/ui.tsx','utf8');const body=source.slice(source.indexOf('  async function confirmDailySelection()'),source.indexOf('  async function openAdjustment'));
 const shifts=['a','b'].map(id=>({id,start_time:'16:00',finish_time:'18:00',break_minutes:10}));
 const review={date:'2026-09-15',profileId:null,selectedIds:['a','b'],actuals:{a:{...planned,finish:'17:30'},b:{...planned,finish:'17:45'}}};
 let updated,release;const gate=new Promise(r=>release=r),calls=[],saving=[];
 const context={dailyConfirmation:review,dailyFlight:{current:false},eligibleDailyConfirmations:()=>shifts,setSaving:v=>saving.push(v),confirmActualBatch,isAdmin:true,supabase:{rpc:async(name,args)=>{calls.push(args);await gate;return {error:args.p_scheduled_id==='b'?{message:'Month locked'}:null}}},setDailyConfirmation:v=>updated=v,flash(){},loadSchedule:async()=>{},loadCoachMonth:async()=>{},loadAdmin:async()=>{},loadOverviewSchedule:async()=>{}};
 const fn=new Function(...Object.keys(context),body+';return confirmDailySelection')(...Object.values(context));const first=fn();await fn();assert.equal(calls.length,1);release();await first;
 assert.deepEqual(updated.succeeded,['a']);assert.deepEqual(updated.selectedIds,['b']);assert.equal(updated.results.b,'Month locked');assert.equal(updated.actuals.b.finish,'17:45');assert.deepEqual(saving,[true,false]);assert.equal(context.dailyFlight.current,false);
});
test('all-success confirmation closes, reports the original count, and does not resubmit successes',async()=>{
 const source=fs.readFileSync('app/dashboard/ui.tsx','utf8');const body=source.slice(source.indexOf('  async function confirmDailySelection()'),source.indexOf('  async function openAdjustment'));
 const shifts=['a','b','c'].map(id=>({id,start_time:'16:00',finish_time:'18:00',break_minutes:10}));
 const review={date:'2026-09-15',profileId:null,selectedIds:['a','b','c'],actuals:{a:planned,b:planned,c:planned}};
 let updated='unchanged',toast='',refreshes=0,calls=0;
 const context={dailyConfirmation:review,dailyFlight:{current:false},eligibleDailyConfirmations:()=>shifts,setSaving(){},confirmActualBatch:async items=>{calls+=items.length;return{succeeded:items.map(item=>item.id),failed:{}}},isAdmin:true,supabase:{rpc:async()=>({error:null})},setDailyConfirmation:value=>updated=value,closeDailyConfirmation:()=>{updated=null},flash:value=>{toast=value},loadSchedule:async()=>{refreshes++},loadCoachMonth:async()=>{},loadAdmin:async()=>{},loadOverviewSchedule:async()=>{}};
 const fn=new Function(...Object.keys(context),body+';return confirmDailySelection')(...Object.values(context));await fn();
 assert.equal(updated,null);assert.equal(toast,'3 shifts confirmed successfully');assert.equal(refreshes,1);assert.equal(calls,3);
});
test('empty confirmation cannot submit and partial retry is failure-only',()=>{
 const source=fs.readFileSync('app/dashboard/ui.tsx','utf8');
 assert.match(source,/disabled=\{saving\|\|selected\.length===0\}/);
 assert.match(source,/Retry \$\{selected\.length\} failed shift/);
 assert.match(source,/selectedIds:Object\.keys\(result\.failed\)/);
 assert.match(source,/if\(result\.succeeded\.length===selected\.length\)/);
 assert.match(source,/closeDailyConfirmation\(\);\s*flash\(`\$\{result\.succeeded\.length\} shift/);
});
