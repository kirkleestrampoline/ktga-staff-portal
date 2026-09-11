// Keep the exact trigger and its scroll ancestors: a class-data refresh preserves
// keyed timetable DOM nodes, while filters and expanded controls stay mounted.
export function captureClassReturnContext(trigger:HTMLElement){
 const x=window.scrollX,y=window.scrollY;
 const ancestors:{element:HTMLElement;top:number;left:number}[]=[];
 for(let element=trigger.parentElement;element;element=element.parentElement)ancestors.push({element,top:element.scrollTop,left:element.scrollLeft});
 trigger.focus({preventScroll:true});
 return ()=>{
  for(const {element,top,left} of ancestors){element.scrollTop=top;element.scrollLeft=left}
  window.scrollTo(x,y);
  if(trigger.isConnected)trigger.focus({preventScroll:true});
 };
}
