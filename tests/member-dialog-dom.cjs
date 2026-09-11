module.exports=function(){
 const oldDoc=global.document,oldWindow=global.window;const properties={};let resized;
 const style={overflow:'auto',cssText:'overflow:auto'};
 const trigger={isConnected:true,focus(options){this.focused=options}};
 const viewport={height:700,offsetTop:0,addEventListener(name,fn){if(name==='resize')resized=fn},removeEventListener(){}};
 global.document={body:{style,append(){}},activeElement:trigger,createElement:()=>({style:{},getBoundingClientRect:()=>({height:600}),remove(){}})};
 global.window={innerHeight:700,scrollX:0,scrollY:650,visualViewport:viewport,addEventListener(){},removeEventListener(){},scrollTo(x,y){this.restored=y}};
 return {trigger,properties,dialog:{style:{setProperty:(k,v)=>properties[k]=v},showModal(){},close(){}},resize(height){viewport.height=height;resized()},restore(){global.document=oldDoc;global.window=oldWindow}};
};
