const {test}=require('node:test');const assert=require('node:assert/strict');const loader=require('./load-typescript.cjs');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
test('family console uses actual Schedule Control hero, scrolling body and footer',()=>{
 const Console=loader()('components/members/member-console.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Console,{title:'Example family',reference:'Reference · Active',onClose:()=>{}},'Details'));
 for(const name of ['v311AdminShiftHero','v405ScheduleControlBody','v405ScheduleControlFoot','iconButton'])assert.ok(html.includes(name));
 assert.match(html,/aria-label="Close family account"/);assert.match(html,/Family account/);assert.match(html,/Example family/);
});
test('closing console restores directory scroll, focus and original body scrolling',()=>{
 let effect,opened=0,closed=0,focused=false,restored;
 const Console=loader({react:{...React,useRef:value=>({current:value}),useEffect:fn=>effect=fn}})('components/members/member-console.tsx').default;
 const element=Console({title:'Family',reference:'Reference',onClose:()=>{},children:null});element.props.ref.current={showModal:()=>opened++,close:()=>closed++};
 const dom=require('./member-dialog-dom.cjs')();element.props.ref.current.style=dom.dialog.style;document.activeElement.focus=options=>focused=options.preventScroll;
 try{const cleanup=effect();assert.equal(opened,1);assert.equal(document.body.style.overflow,'hidden');assert.equal(dom.properties['--member-height'],'600px');dom.resize(780);assert.equal(dom.properties['--member-height'],'600px');dom.resize(340);assert.equal(dom.properties['--member-height'],'340px');cleanup();assert.equal(closed,1);assert.equal(window.restored,650);assert.equal(document.body.style.cssText,'overflow:auto');assert.equal(focused,true)}finally{dom.restore()}
});
test('member creation reuses Schedule hero and has icon close plus one Cancel action',()=>{
 const Editor=loader()('components/members/member-editor.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Editor,{spec:{kind:'create'},onClose:()=>{},onSave:async()=>{},onSaved:()=>{}}));
 assert.match(html,/v311AdminShiftHero/);assert.match(html,/aria-label="Close member form"/);assert.equal((html.match(/>Cancel<\/button>/g)||[]).length,1);assert.match(html,/Creation steps/);
});
test('nested Members dialogs keep background locked until the last dialog closes',()=>{
 const effects=[];const hooks=loader({react:{...React,useEffect:fn=>effects.push(fn)}})('components/members/use-member-dialog.ts');const dom=require('./member-dialog-dom.cjs')();
 try{hooks.useMemberDialog({current:dom.dialog});hooks.useMemberDialog({current:dom.dialog});const first=effects[0](),second=effects[1]();second();assert.equal(document.body.style.position,'fixed');first();assert.equal(document.body.style.cssText,'overflow:auto')}finally{dom.restore()}
});
test('mobile height stays stable as Safari-style chrome expands, then caps for the keyboard',()=>{
 let effect;const hooks=loader({react:{...React,useEffect:fn=>effect=fn}})('components/members/use-member-dialog.ts');const dom=require('./member-dialog-dom.cjs')();
 try{hooks.useMemberDialog({current:dom.dialog});const cleanup=effect();for(const height of [700,760,650,800,600]){dom.resize(height);assert.equal(dom.properties['--member-height'],'600px')}dom.resize(310);assert.equal(dom.properties['--member-height'],'310px');dom.resize(750);assert.equal(dom.properties['--member-height'],'600px');cleanup()}finally{dom.restore()}
});
