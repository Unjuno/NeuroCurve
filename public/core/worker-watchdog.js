/**
 * Timeout guard for a dedicated browser Worker. No global state.
 * Each accepted Worker event renews its inactivity deadline; stale callbacks
 * from a previously cleared timer must never time out the current run.
 */
export function createWorkerWatchdog({
 schedule=setTimeout,unschedule=clearTimeout,onTimeout,
 startupMs=15000,activeMs=130000
}={}){
 if(typeof schedule!=='function'||typeof unschedule!=='function'||typeof onTimeout!=='function')
  throw new TypeError('watchdog timer and callback must be functions');
 if(!Number.isSafeInteger(startupMs)||startupMs<1||!Number.isSafeInteger(activeMs)||activeMs<1)
  throw new RangeError('watchdog deadlines must be positive integers');
 let timer=null,generation=0,stopped=false,phase='startup';
 function arm(ms){
  if(timer!==null)unschedule(timer);
  const current=++generation;
  timer=schedule(()=>{
   if(stopped||generation!==current)return;
   stopped=true;timer=null;onTimeout(phase);
  },ms);
 }
 arm(startupMs);
 return {
  activity(){
   if(stopped)return false;
   phase='active';arm(activeMs);return true;
  },
  stop(){
   if(stopped)return false;
   stopped=true;generation++;
   if(timer!==null)unschedule(timer);
   timer=null;return true;
  },
  get active(){return !stopped;}
 };
}
