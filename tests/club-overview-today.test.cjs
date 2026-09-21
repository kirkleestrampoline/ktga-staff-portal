const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const load=require('./load-typescript.cjs')();
const {staffingCostSnapshot}=load('lib/dashboard/staffing-costs.ts');

const source=fs.readFileSync('app/dashboard/ui.tsx','utf8');
const css=fs.readFileSync('app/globals.css','utf8');
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('Today retains its session cards and isolated operational rail',()=>{
  const today=between('  function TodayCommandView(){','  function TodayView(){');
  assert.match(today,/<TodayMetricGrid/);
  assert.match(today,/<TodayQuickActions\/>/);
  assert.match(today,/<SessionSchedule rows=\{rows\}\/>/);
  assert.match(today,/<TodayOperationalRail rows=\{rows\}\/>/);
  assert.ok(today.indexOf('<TodayQuickActions/>')<today.indexOf('clubOverviewTodayLayout'));
});

test('Today rail includes complete progress, capacity watch and supported attention',()=>{
  const rail=between('  function TodayOperationalRail({rows}', '  function TodayCommandView(){');
  for(const label of ['DAY PROGRESS','CAPACITY WATCH','NEEDS ATTENTION','sessions complete','Programme complete','Everything is ready for today'])assert.match(rail,new RegExp(label));
  assert.match(rail,/capacityRows=.*slice\(0,3\)/);
});

test('Today quick actions preserve their destinations, including Class Library',()=>{
  const actions=between('  function TodayQuickActions(){','  function TodayOperationalRail({rows}');
  for(const label of ['Timetable','Class library','Staffing','Members'])assert.match(actions,new RegExp(`>${label}<`));
  assert.match(actions,/onClick=\{openClassLibrary\}/);
});

test('available remains an adjective and mobile ordering leaves the rail visible',()=>{
  const schedule=between('  function SessionSchedule({rows}', '  function TodayQuickActions(){');
  assert.match(schedule,/`\$\{available\} available`/);
  assert.doesNotMatch(schedule,/plural\(available,'available'\)|availables/);
  assert.match(css,/\.clubOverviewTodayRail\{grid-template-rows:none;align-content:start;overflow:visible\}/);
  assert.match(css,/\.clubOverviewTodayRail\{display:contents\}.*\.clubOverviewNeedsAttention\{order:1\}.*\.clubOverviewSchedulePanel\{order:2\}.*\.clubOverviewProgress\{order:3\}.*\.clubOverviewCapacityWatch\{order:4\}/);
});

test('Dashboard uses URL-backed top-level panels rather than Overview accordions',()=>{
  const tabs=between('  function DashboardPanelTabs(){','  function renderClassCapacityGroups(');
  for(const label of ['Overview','Members','Classes & Capacity','Staffing & Costs','Finance'])assert.match(tabs,new RegExp(`'${label}'`));
  assert.match(tabs,/type="button" role="tab" aria-selected=/);
  assert.match(tabs,/setDashboardOverviewPanel/);
  assert.doesNotMatch(source,/expandedOverviewSections|renderOverviewDisclosure|av-dashboard-overview-sections|Expand all|Collapse all|clubOverviewOverviewAccordion/);
  assert.doesNotMatch(source,/Attendance detail is available from individual registers/);
});

test('both staffing views use one forecast-versus-normal selector',()=>{
  const costs=staffingCostSnapshot({normalStaffingCost:868.06,currentForecast:998.53,actualCostSoFar:708.56});
  assert.deepEqual(costs,{normalStaffingCost:868.06,currentForecast:998.53,actualCostSoFar:708.56,forecastVariance:130.47});
  const dedicated=between('  function DashboardLegacyView(', '  function ScheduleView(){');
  assert.match(dedicated,/staffingCosts\.forecastVariance/);
  assert.doesNotMatch(dedicated,/actualScheduleCost-forecastCost/);
});

test('capacity cards open a fixed detail dialog without expanding the document',()=>{
  const capacity=between('  function renderClassCapacityGroups(', '  function renderOverviewPanel(');
  assert.match(capacity,/aria-haspopup="dialog"/);
  assert.match(capacity,/role="dialog" aria-modal="true"/);
  assert.match(capacity,/event\.key==='Escape'/);
  assert.match(capacity,/capacityDetailReturnFocus/);
  assert.doesNotMatch(capacity,/aria-expanded|expandedCapacityGroups|clubOverviewRecurrences/);
  assert.match(css,/\.clubOverviewCapacityDrawerBackdrop\{position:fixed/);
});

test('panel changes preserve page position and Overview prioritises action without duplicate KPI panels',()=>{
  const navigate=between("  function setDashboardOverviewPanel(", '  function openClassLibrary(){');
  const overview=between('  function renderOverviewPanel(', '  function DashboardContent(){');
  assert.match(navigate,/history\.pushState/);
  assert.doesNotMatch(navigate,/scrollTo|focus\(/);
  for(const label of ['Active families','Active athletes','Active enrolments','Trials','Action centre','Needs attention','Places to fill','Explore your club','Member billing is not connected yet','Planned'])assert.match(overview,new RegExp(label));
  assert.doesNotMatch(overview,/Membership journey|Club operations/);
  assert.match(overview,/active_places/);
  assert.match(overview,/available_spaces>0/);
  assert.match(overview,/\.sort\(\(a,b\)=>\(b\.available_spaces\|\|0\)-\(a\.available_spaces\|\|0\)/);
  assert.match(overview,/\.slice\(0,3\)/);
  assert.match(overview,/unassignedScheduleCount>0/);
  assert.match(overview,/outstanding>0/);
  assert.match(overview,/snapshot\.waiting_enrolments/);
  assert.match(overview,/aria-label=\{`\$\{row\.class_name\} utilisation`\}/);
  assert.match(overview,/type="button" key=\{card\.panel\}/);
  assert.match(overview,/setDashboardOverviewPanel\(card\.panel\)/);
  assert.doesNotMatch(overview,/Staff cost snapshot|Attendance/);
  assert.doesNotMatch(css,/clubOverviewDisclosureTools|clubOverviewOverviewAccordions|clubOverviewOverviewAccordion|clubOverviewRecurrences/);
  for(const selector of ['clubOverviewKpis','clubOverviewExploreCard','clubOverviewFinancePlanned'])assert.match(css,new RegExp(`\\.${selector}`));
  assert.match(source,/function renderOverviewPanel/);
  assert.match(source,/function renderClassCapacityGroups/);
});
