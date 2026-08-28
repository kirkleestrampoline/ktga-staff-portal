export default function StatusPill({status}:{status?:string|null}){
 const s=(status||"draft").toLowerCase();
 const cls=s==="paid"?"pillPaid":s==="submitted"?"pillSubmitted":s.includes("overdue")?"pillWarning":"pillDraft";
 return <span className={`pill ${cls}`}><span className="dot"/>{s.replaceAll("_"," ")}</span>;
}
