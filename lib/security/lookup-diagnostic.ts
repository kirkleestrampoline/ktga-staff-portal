// Log classifications only: upstream messages can contain URLs and personal data.
const transportCodes = new Set(['ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE']);
export function transportCode(error:unknown):string {
  let value=error as {code?:unknown;cause?:unknown}|undefined;
  for(let depth=0;value && depth<5;depth++){
    if(typeof value.code==='string' && transportCodes.has(value.code))return value.code;
    value=value.cause as typeof value;
  }
  return 'UNKNOWN_TRANSPORT_ERROR';
}
export function lookupDiagnostic(stage:string,error:{code?:string;message?:string},status?:number){
  return {stage,code:/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code||'')?error.code:'UNCLASSIFIED',
    http_status:typeof status==='number'?status:null,
    category:error.message?.includes('fetch failed')?'transport':'upstream'};
}
export type LookupDiagnostic=ReturnType<typeof lookupDiagnostic>;
export const loginFetch:typeof fetch=async(input,init)=>{
  try{return await fetch(input,init);}
  catch(error){
    console.error('[login] lookup transport failed',{code:transportCode(error)});
    throw error;
  }
};
