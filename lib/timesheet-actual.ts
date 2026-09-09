export type ActualTimes={start:string;finish:string;breakMinutes:number};
export function canEditShift(admin:boolean,existing:boolean,status?:string|null){
  return status!=="submitted"&&status!=="paid"&&(admin||!existing);
}
function minutes(t:string){const [h,m]=t.split(":").map(Number);return h*60+m}
export function actualTimeRequest(id:string,actual:ActualTimes,planned:ActualTimes,admin:boolean){
  const duration=(t:ActualTimes)=>{let value=minutes(t.finish)-minutes(t.start)-t.breakMinutes;if(value<0)value+=1440;return Math.max(0,value)};
  const overtime=!admin&&duration(actual)>duration(planned);
  return {name:overtime?"request_scheduled_overtime":"confirm_scheduled_actual",args:{p_scheduled_id:id,p_start_time:actual.start,p_finish_time:actual.finish,p_break_minutes:actual.breakMinutes,...(overtime?{p_reason:"Actual time entered during daily confirmation"}:{})}};
}

export function approvalTimeRequest(id:string,actual:ActualTimes){
  return {name:"approve_extra_shift_actual",args:{p_shift_id:id,p_start_time:actual.start,p_finish_time:actual.finish,p_break_minutes:actual.breakMinutes}};
}
