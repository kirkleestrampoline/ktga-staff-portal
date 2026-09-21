export type StaffingCostSnapshot={
  normalStaffingCost:number;
  currentForecast:number;
  actualCostSoFar:number;
  forecastVariance:number;
};

export function staffingCostSnapshot({normalStaffingCost,currentForecast,actualCostSoFar}:{normalStaffingCost:number;currentForecast:number;actualCostSoFar:number}):StaffingCostSnapshot{
  return {normalStaffingCost,currentForecast,actualCostSoFar,forecastVariance:Math.round((currentForecast-normalStaffingCost)*100)/100};
}
