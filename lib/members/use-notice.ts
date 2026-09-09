"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
export function useMemberNotice(){
 const [notice,setNotice]=useState('');const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clear=useCallback(()=>{if(timer.current!==null)clearTimeout(timer.current);timer.current=null;setNotice('')},[]);
 const show=useCallback((message:string)=>{clear();setNotice(message);if(message)timer.current=setTimeout(()=>{timer.current=null;setNotice('')},4000)},[clear]);
 useEffect(()=>()=>{if(timer.current!==null)clearTimeout(timer.current)},[]);
 return {notice,show,clear};
}
