const {test}=require('node:test');const assert=require('node:assert/strict');const loader=require('./load-typescript.cjs');
test('success notice replaces, restarts at four seconds, dismisses and cleans up on unmount',()=>{
 let message='',cleanup,seq=0;const timers=new Map();const previous=[global.setTimeout,global.clearTimeout];
 global.setTimeout=(fn,ms)=>{assert.equal(ms,4000);timers.set(++seq,fn);return seq};global.clearTimeout=id=>timers.delete(id);
 const hook=loader({react:{useState:()=>['',value=>message=value],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:fn=>cleanup=fn()}})('lib/members/use-notice.ts');
 try{const notice=hook.useMemberNotice();notice.show('Saved');assert.equal(message,'Saved');const old=seq;notice.show('Saved');assert.equal(timers.has(old),false);assert.equal(timers.size,1);timers.get(seq)();assert.equal(message,'');timers.clear();notice.show('Updated');notice.clear();assert.equal(message,'');assert.equal(timers.size,0);notice.show('Saved');cleanup();assert.equal(timers.size,0)}finally{[global.setTimeout,global.clearTimeout]=previous}
});
