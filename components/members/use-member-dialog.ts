'use client';
import {useEffect,type RefObject} from 'react';
// Reference counting also covers an editor or deletion confirmation over a family.
let locks=0;
let restorePage=()=>{};
export function useMemberDialog(ref:RefObject<HTMLDialogElement|null>){
 useEffect(()=>{
  const dialog=ref.current!,trigger=document.activeElement as HTMLElement|null;
  if(locks++===0){const body=document.body,previous=body.style.cssText,x=window.scrollX,y=window.scrollY;body.style.position='fixed';body.style.top=`-${y}px`;body.style.width='100%';body.style.overflow='hidden';restorePage=()=>{body.style.cssText=previous;window.scrollTo(x,y)}}
  const probe=document.createElement('div');probe.style.cssText='position:fixed;height:100svh;visibility:hidden;pointer-events:none';document.body.append(probe);
  const viewport=window.visualViewport;
  const fallbackHeight=window.visualViewport?.height||window.innerHeight;
  function resize(){const stable=probe.getBoundingClientRect().height||fallbackHeight;dialog.style.setProperty('--member-height',`${Math.min(stable,viewport?.height||window.innerHeight)}px`);dialog.style.setProperty('--member-top',`${viewport?.offsetTop||0}px`)}
  resize();dialog.showModal();viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);
  return()=>{viewport?.removeEventListener('resize',resize);viewport?.removeEventListener('scroll',resize);window.removeEventListener('resize',resize);probe.remove();dialog.close();if(--locks===0)restorePage();if(trigger?.isConnected)trigger.focus({preventScroll:true})};
 },[ref]);
}
