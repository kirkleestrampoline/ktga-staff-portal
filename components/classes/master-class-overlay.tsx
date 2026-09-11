'use client';
import {useEffect} from 'react';
import ClassesView from './classes-view';
import type {CalendarData} from '@/lib/classes/model';
export default function MasterClassOverlay({profileId,canEdit,restore,onClose,onSaved,onOpenInClasses}:{profileId:string;canEdit:boolean;restore:()=>void;onClose:()=>void;onSaved:(data:CalendarData)=>void;onOpenInClasses:()=>void}){
 // Restore after child dialogs have closed and completed their own cleanup.
 useEffect(()=>()=>queueMicrotask(restore),[restore]);
 return <ClassesView overlay initialProfileId={profileId} canEdit={canEdit} onClose={onClose} onSaved={onSaved} onOpenInClasses={onOpenInClasses}/>;
}
