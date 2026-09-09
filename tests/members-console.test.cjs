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
 const oldDoc=global.document,oldWindow=global.window;
 global.document={body:{style:{overflow:'auto'}},activeElement:{focus:options=>focused=options.preventScroll}};global.window={scrollY:650,scrollTo:(x,y)=>restored=y};
 try{const cleanup=effect();assert.equal(opened,1);assert.equal(document.body.style.overflow,'hidden');cleanup();assert.equal(closed,1);assert.equal(restored,650);assert.equal(document.body.style.overflow,'auto');assert.equal(focused,true)}finally{global.document=oldDoc;global.window=oldWindow}
});
test('member creation reuses Schedule hero and has icon close plus one Cancel action',()=>{
 const Editor=loader()('components/members/member-editor.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Editor,{spec:{kind:'create'},onClose:()=>{},onSave:async()=>{},onSaved:()=>{}}));
 assert.match(html,/v311AdminShiftHero/);assert.match(html,/aria-label="Close member form"/);assert.equal((html.match(/>Cancel<\/button>/g)||[]).length,1);assert.match(html,/Creation steps/);
});
