const test=require('node:test');
const assert=require('node:assert/strict');
const {canEditShift,actualTimeRequest,approvalTimeRequest}=require('./load-typescript.cjs')()('lib/timesheet-actual.ts');
test('existing staff shifts are read-only; administrators can edit draft shifts',()=>{
  assert.equal(canEditShift(false,true,'draft'),false);
  assert.equal(canEditShift(true,true,'draft'),true);
  assert.equal(canEditShift(true,true,null),true);
});
test('submitted and paid months cannot be edited or receive new shifts',()=>{
  for(const status of ['submitted','paid'])for(const admin of [true,false])for(const existing of [true,false])assert.equal(canEditShift(admin,existing,status),false);
});
const planned={start:'16:00',finish:'20:00',breakMinutes:0};
test('daily confirmation sends entered shorter hours, not scheduled hours',()=>{
  const r=actualTimeRequest('shift',{...planned,finish:'18:30'},planned,true);
  assert.equal(r.name,'confirm_scheduled_actual');assert.equal(r.args.p_finish_time,'18:30');
});
test('staff extra time retains approval routing',()=>{
  assert.equal(actualTimeRequest('shift',{...planned,finish:'21:00'},planned,false).name,'request_scheduled_overtime');
  assert.equal(actualTimeRequest('shift',{...planned,finish:'18:00'},planned,false).name,'confirm_scheduled_actual');
  assert.equal(actualTimeRequest('shift',{...planned,finish:'21:00'},planned,true).name,'confirm_scheduled_actual');
});

test('approval carries edited times and break in a single RPC request',()=>{
  assert.deepEqual(approvalTimeRequest('extra',{start:'09:15',finish:'11:30',breakMinutes:10}),{
    name:'approve_extra_shift_actual',args:{p_shift_id:'extra',p_start_time:'09:15',p_finish_time:'11:30',p_break_minutes:10}
  });
});
test('overnight work retains the existing duration convention',()=>{
  assert.equal(actualTimeRequest('shift',{start:'22:00',finish:'01:00',breakMinutes:0},{start:'22:00',finish:'02:00',breakMinutes:0},false).name,'confirm_scheduled_actual');
});
