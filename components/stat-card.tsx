import { ReactNode } from "react";
export default function StatCard({label,value,foot,icon}:{label:string;value:string;foot?:string;icon:ReactNode}){
 return <div className="card statCard"><div className="statTop"><div className="statLabel">{label}</div><div className="statIcon">{icon}</div></div><div><div className="statValue">{value}</div>{foot&&<div className="statFoot">{foot}</div>}</div></div>;
}
