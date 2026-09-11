const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-typescript.cjs')();
const {navigationForRole,isFutureModule,futureModules,isNavigationGroup,navigationItemActive}=load('lib/navigation.ts');
const {dashboardTabs,coachDashboardTabs,dashboardTabForRole}=load('types/navigation.ts');
const links=items=>items.flatMap(item=>isNavigationGroup(item)?item.children:isFutureModule(item)?item.enabled?[{id:item.destination}]:[]:[item]);
for(const role of ['admin','club_owner','org_admin','coach','unknown'])test(`${role}: navigation preserves exactly the existing allowed destinations`,()=>{
 const items=navigationForRole(role),actual=links(items).map(item=>item.id);
 assert.deepEqual([...actual].sort(),[...(['admin','club_owner','org_admin'].includes(role)?dashboardTabs:coachDashboardTabs)].sort());
 assert.equal(new Set(actual).size,actual.length);
 for(const id of actual)assert.equal(dashboardTabForRole(id,role),id);
});
test('administrator module order and Staff children match the release',()=>{
 const items=navigationForRole('club_owner');
 assert.deepEqual(items.map(item=>item.label),['Club Overview','Staff','Members','Classes','Schedule','Progress','Finance','Communications','Reports','Settings','My Profile']);
 assert.deepEqual(items.find(isNavigationGroup).children.map(item=>item.label),['People','Availability','Staff Rota','Leave','Workforce','Expenses','Payroll','Staff Invoices']);
});
test('every Staff child activates its parent, outside pages do not',()=>{
 const group=navigationForRole('admin').find(isNavigationGroup);
 for(const child of group.children)assert.equal(navigationItemActive(group,child.id),true);
 for(const tab of ['dashboard','reports','settings','profile'])assert.equal(navigationItemActive(group,tab),false);
});
test('staff module is not a page destination; coach personal labels are retained',()=>{
 const items=navigationForRole('coach');
 assert.deepEqual(items.map(item=>item.id),['staff-module','profile']);
 assert.equal(dashboardTabs.includes('staff-module'),false);
 assert.equal(items[0].children.find(item=>item.id==='timesheets').label,'My Timesheet');
 assert.equal(items[0].children.find(item=>item.id==='invoices').label,'My Payslips');
});

test('module availability and descriptions remain administrator-only',()=>{
 assert.equal(futureModules.length,6);
 for(const role of ['admin','club_owner','org_admin'])assert.deepEqual(navigationForRole(role).filter(isFutureModule),futureModules);
 for(const role of ['coach','unknown',''])assert.equal(navigationForRole(role).some(isFutureModule),false);
 for(const module of futureModules){assert.equal(module.enabled,['module-members','module-classes'].includes(module.id));assert.ok(module.description.length>20);assert.equal(navigationItemActive(module,'schedule'),false)}
});
test('Staff Rota keeps the original schedule destination',()=>{
 assert.equal(navigationForRole('admin').find(isNavigationGroup).children.find(item=>item.label==='Staff Rota').id,'schedule');
});
test('mobile Menu is second and contains only permitted platform sections',()=>{
 const {mobileNavigationForRole}=load('lib/navigation.ts');
 for(const role of ['admin','club_owner','org_admin']){
  const {primary,menu}=mobileNavigationForRole(role);
  assert.equal(primary[1].id,'staff-module');
  assert.deepEqual(menu.map(item=>item.label),['Staff','Members','Classes','Schedule','Progress','Finance','Communications']);
 }
 const staff=mobileNavigationForRole('coach');
 assert.equal(staff.primary[1].id,'staff-module');
 assert.deepEqual(staff.menu.map(item=>item.label),['Staff']);
 assert.deepEqual(staff.primary.map(item=>item.id),['schedule','staff-module','profile']);
});

test('Members is one enabled section, never separate Families or Athletes modules',()=>{
 const module=navigationForRole('club_owner').find(item=>item.id==='module-members');
 assert.equal(module.enabled,true);assert.equal(module.destination,'members');
 assert.equal(navigationItemActive(module,'members'),true);
 assert.equal(dashboardTabForRole('members','coach'),'schedule');
 assert.equal(navigationForRole('coach').some(item=>item.id==='module-members'),false);
 assert.equal(navigationForRole('admin').some(item=>['Families','Athletes'].includes(item.label)),false);
});
test('staff mobile Menu opens only existing permitted destinations with personal labels',()=>{
 const {mobileNavigationForRole}=load('lib/navigation.ts');
 const mobile=mobileNavigationForRole('coach');
 assert.equal(mobile.directStaff,true);
 const desktop=navigationForRole('coach').find(isNavigationGroup).children;
 assert.deepEqual(mobile.staffDestinations.map(item=>item.id),desktop.map(item=>item.id));
 assert.deepEqual(mobile.staffDestinations.map(item=>item.label),['My Schedule','Leave & Availability','My Expenses','My Timesheets','My Payslips']);
 assert.equal(mobile.staffDestinations.some(item=>['staff','workforce','availability'].includes(item.id)),false);
 assert.equal(desktop.find(item=>item.id==='timesheets').label,'My Timesheet');
 for(const role of ['admin','club_owner','org_admin']){
  const admin=mobileNavigationForRole(role);
  assert.equal(admin.directStaff,false);
  assert.deepEqual(admin.staffDestinations,navigationForRole(role).find(isNavigationGroup).children);
 }
});
