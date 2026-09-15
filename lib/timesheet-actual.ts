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

// Same midnight rollover and break limits as confirm_scheduled_actual.
export function validateActualTimes(actual:ActualTimes){
  if(!actual||![actual.start,actual.finish].every(t=>/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t)))return 'Enter a valid actual start and end.';
  const elapsed=(minutes(actual.finish)-minutes(actual.start)+1440)%1440;
  if(!elapsed)return 'Actual end must be after start (and less than 24 hours later).';
  if(!Number.isInteger(actual.breakMinutes)||actual.breakMinutes<0||actual.breakMinutes>=elapsed)return 'Break must be shorter than the actual shift.';
  return null;
}
export function earlierFinish(actual:ActualTimes,planned:ActualTimes,reduction:number):ActualTimes{
  const elapsed=(minutes(planned.finish)-minutes(planned.start)+1440)%1440;
  if(!Number.isInteger(reduction)||reduction<=0||reduction>=elapsed)throw new Error('Enter fewer minutes than the scheduled shift length.');
  const finish=(minutes(planned.finish)-reduction+1440)%1440;
  const result={...actual,finish:`${String(Math.floor(finish/60)).padStart(2,'0')}:${String(finish%60).padStart(2,'0')}`};
  // Compare on the scheduled day's timeline so a reduction cannot turn a
  // crossed start into an accidental 23-hour overnight shift.
  const end=minutes(planned.start)+elapsed-reduction;
  let start=minutes(actual.start);if(minutes(planned.finish)<minutes(planned.start)&&start<minutes(planned.finish))start+=1440;
  if(end<=start||end-start<=actual.breakMinutes)throw new Error('Earlier finish must remain after actual start and break.');
  return result;
}
export function resetActualTimes(planned:ActualTimes):ActualTimes{return {...planned}}
export async function confirmActualBatch(items:{id:string;actual:ActualTimes;planned:ActualTimes}[],admin:boolean,save:(request:ReturnType<typeof actualTimeRequest>)=>Promise<void>){
  const succeeded:string[]=[],failed:Record<string,string>={};
  for(const item of items){
    try{const invalid=validateActualTimes(item.actual);if(invalid)throw new Error(invalid);await save(actualTimeRequest(item.id,item.actual,item.planned,admin));succeeded.push(item.id)}
    catch(error){failed[item.id]=error instanceof Error?error.message:'Unable to save actual times. Retry this shift.'}
  }
  return {succeeded,failed};
}
