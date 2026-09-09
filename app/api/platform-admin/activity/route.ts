import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePlatformAdmin } from '@/lib/platform-admin';
export async function GET(){
 if(!await requirePlatformAdmin())return NextResponse.json({error:'Active Platform Admin required'},{status:403});
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.from('platform_activity').select('id,action,created_at,club_id').order('created_at',{ascending:false}).limit(50);
 if(error)return NextResponse.json({error:'Platform activity could not be loaded'},{status:500});
 return NextResponse.json({activity:data},{headers:{'Cache-Control':'no-store'}});
}
