const {test}=require('node:test');
const assert=require('node:assert/strict');
const loader=require('./load-typescript.cjs');
const {accountHome,platformSections,platformSection}=loader()('lib/platform-navigation.ts');
test('Platform Admin login goes to platform; operational roles retain dashboard',()=>{
 assert.equal(accountHome('admin'),'/platform-admin');
 for(const role of ['club_owner','org_admin','coach'])assert.equal(accountHome(role),'/dashboard');
});
test('platform navigation contains only platform sections',()=>{
 assert.deepEqual(platformSections.map(s=>s.label),['Platform Overview','Clubs','Platform Activity','Account']);
 for(const view of ['staff','members','schedule','settings','reports'])assert.equal(platformSection(view),'overview');
});
for(const role of ['admin','club_owner','org_admin','coach'])test(`dashboard boundary for ${role}`,async()=>{
 const profile={id:'actor',role,is_active:true,club_id:'club'};
 const client={auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from(table){const query={select(){return query},eq(){return query},single:async()=>({data:profile}),maybeSingle:async()=>({data:{active:true}})};return query}};
 const page=loader({'@/lib/supabase/server':{createClient:async()=>client},'next/navigation':{redirect:path=>{throw new Error(`REDIRECT:${path}`)}},'./ui':{default:()=>null}})('app/dashboard/page.tsx').default;
 if(role==='admin')await assert.rejects(()=>page({searchParams:Promise.resolve({tab:'members'})}),/REDIRECT:\/platform-admin/);
 else assert.ok(await page({searchParams:Promise.resolve({})}));
});
test('platform page rejects non-platform actors before querying account information',async()=>{
 const page=loader({'@/lib/platform-admin':{requirePlatformAdmin:async()=>null},'@/lib/supabase/server':{createClient:()=>{throw new Error('must not query')}},'next/navigation':{redirect:path=>{throw new Error(`REDIRECT:${path}`)}},'./ui':{default:()=>null}})('app/platform-admin/page.tsx').default;
 await assert.rejects(()=>page({searchParams:Promise.resolve({})}),/REDIRECT:\/dashboard/);
});
