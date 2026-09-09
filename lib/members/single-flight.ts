// A synchronous latch prevents a second click before React renders disabled state.
export function singleFlight(){let pending=false;return async function run(action:()=>Promise<void>){if(pending)return;pending=true;try{await action()}finally{pending=false}}}
