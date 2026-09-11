const {test}=require('node:test');const assert=require('node:assert/strict');const loader=require('./load-typescript.cjs');
test('deletion latch ignores double submission and releases after failure',async()=>{
 const run=loader()('lib/members/single-flight.ts').singleFlight();let release,calls=0;const first=run(async()=>{calls++;await new Promise(r=>release=r)});
 await run(async()=>{calls++});assert.equal(calls,1);release();await first;
 await assert.rejects(run(async()=>{throw Error('failure')}));await run(async()=>{calls++});assert.equal(calls,2);
});
test('filtered directory passes filters to a scoped RPC without caller tenant',async()=>{
 const id='00000000-0000-4000-8000-000000000001';const api=loader({'@/lib/security/account-access':{requireActiveAccount:async()=>({user:{id},profile:{id,role:'club_owner',club_id:id,is_active:true},club:{id,active:true}})}})('lib/members/management.ts');
 let args;await api.readMemberDirectory({rpc:async(n,a)=>{args=[n,a];return {data:{families:[]},error:null}}},'',0,null,{state:'archived',journey:'trial'});
 assert.equal(args[0],'member_directory_filtered');assert.equal(args[1].p_state,'archived');assert.equal(args[1].p_journey,'trial');assert.equal('club_id' in args[1],false);
});
test('danger dialog is labelled, names affected records and starts with deletion disabled',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const Delete=loader()('components/members/member-delete.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Delete,{family:{display_name:'Sample family',contacts:[{id:'c',display_name:'Sample contact'}],athletes:[{id:'a',display_name:'Sample athlete'}]},onClose:()=>{},onDelete:async()=>{}}));
 assert.match(html,/<dialog[^>]+aria-labelledby="member-delete-title"/);assert.match(html,/Sample contact/);assert.match(html,/Sample athlete/);assert.match(html,/cannot be undone/);assert.match(html,/<button[^>]+disabled=""[^>]*>Permanently delete/);
});
test('family workspace only renders danger controls with server-provided owner capability',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const Detail=loader()('components/members/member-detail.tsx').default;
 const props={family:{id:'f',display_name:'Family',status:'active',updated_at:'2026-01-01',contacts:[],athletes:[],relationships:[]},athleteId:null,onFamily:()=>{},onAthlete:()=>{},onEdit:()=>{},onStatus:()=>{},onBack:()=>{},onDelete:()=>{},busy:false};
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(Detail,{...props,canDelete:false})),/Permanently delete/);
 assert.match(renderToStaticMarkup(React.createElement(Detail,{...props,canDelete:true})),/Permanently delete family/);
});
test('mobile danger modal opens natively, restores focus and refuses Escape while submitting',()=>{
 const React=require('react');let effect;let stateIndex=0;
 const mock={...React,useRef:value=>({current:value}),useEffect:fn=>{effect=fn},useState:value=>[stateIndex++===1?true:value,()=>{}]};
 const Delete=loader({react:mock})('components/members/member-delete.tsx').default;
 let closed=0,opened=0,focused=0,cancelled=0;
 const element=Delete({family:{display_name:'Family',contacts:[],athletes:[]},onClose:()=>closed++,onDelete:async()=>{}});
 element.props.ref.current={showModal:()=>opened++,close:()=>closed++};
 const dom=require('./member-dialog-dom.cjs')();element.props.ref.current.style=dom.dialog.style;document.activeElement.focus=()=>focused++;
 try{const cleanup=effect();assert.equal(opened,1);element.props.onCancel({preventDefault:()=>cancelled++});assert.equal(cancelled,1);assert.equal(closed,0);cleanup();assert.equal(closed,1);assert.equal(focused,1)}finally{dom.restore()}
});
