/**
 * Pure, deterministic state machine for the NeuroCurve user journey.
 *
 * This reducer owns workflow phases and revision / request guards; it deliberately
 * does not own large mutable curves, WebGPU devices, Worker instances, secrets,
 * or scientific measurements. Those are handled by the UI adapters.
 *
 * Orthogonal regions: document revision, local evaluation, opt-in sharing.
 * Invalid or late events are no-ops (same object identity).
 */
const ACTIVE=new Set(['preparing','running']);

export function initialWorkflow(){
 return {
  documentRevision:0,
  evaluation:{phase:'idle',sequence:0,runId:null,runRevision:null,runSelection:null,selection:'',completedRevision:null,completedSelection:null,error:null},
  sharing:{enabled:false,phase:'unavailable',requestId:null,preparedRevision:null,error:null}
 };
}

export function isEvaluationBusy(state){return ACTIVE.has(state.evaluation.phase);}
export function isCurrentResult(state){
 const e=state.evaluation;
 return e.phase==='complete' && e.completedRevision===state.documentRevision && e.completedSelection===e.selection;
}
export function maySubmitShare(state){
 const s=state.sharing;
 return s.enabled && (s.phase==='prepared'||s.phase==='error') && s.preparedRevision===state.documentRevision && !!s.requestId;
}
export function workflowLabel(state){
 return ({idle:'未評価',preparing:'学習の準備中',running:'学習中',complete:'評価完了',partial:'一部課題失敗・総合点未確定',stale:'条件変更・再評価が必要',error:'学習失敗',cancelled:'学習を中断'})[state.evaluation.phase];
}

export function transitionWorkflow(state,event){
 if(!state||!event||typeof event.type!=='string')throw new TypeError('workflow event is required');
 const e=state.evaluation,s=state.sharing,rev=state.documentRevision;
 switch(event.type){
  case 'DOCUMENT_CHANGED':{
   const evaluation=e.phase==='complete'?{...e,phase:'stale'}:e;
   const sharing=(s.phase==='prepared'||s.phase==='error')?{...s,phase:s.enabled?'idle':'unavailable',requestId:null,preparedRevision:null,error:null}:s;
   return {...state,documentRevision:rev+1,evaluation,sharing};
  }
  case 'SELECTION_CHANGED':{
   if(typeof event.key!=='string'||!event.key||event.key===e.selection)return state;
   return {...state,evaluation:{...e,selection:event.key,phase:e.phase==='complete'?'stale':e.phase}};
  }
  case 'RUN_START':{
   if(isEvaluationBusy(state)||!e.selection)return state;
   return {...state,evaluation:{...e,phase:'preparing',sequence:e.sequence+1,runId:e.sequence+1,runRevision:rev,runSelection:e.selection,completedRevision:null,completedSelection:null,error:null}};
  }
  case 'RUN_READY':{
   if(e.phase!=='preparing'||event.runId!==e.runId)return state;
   return {...state,evaluation:{...e,phase:'running'}};
  }
  case 'RUN_SUCCESS':{
   if(!isEvaluationBusy(state)||event.runId!==e.runId)return state;
   const current=rev===e.runRevision&&e.selection===e.runSelection;
   return {...state,evaluation:{...e,phase:current?'complete':'stale',completedRevision:e.runRevision,completedSelection:e.runSelection,error:null}};
  }
  case 'RUN_PARTIAL':{
   if(!isEvaluationBusy(state)||event.runId!==e.runId)return state;
   return {...state,evaluation:{...e,phase:'partial',error:String(event.error??'incomplete benchmark')}};
  }
  case 'RUN_FAILURE':{
   if(!isEvaluationBusy(state)||event.runId!==e.runId)return state;
   return {...state,evaluation:{...e,phase:'error',error:String(event.error??'unknown error')}};
  }
  case 'RUN_CANCEL':{
   if(!isEvaluationBusy(state)||event.runId!==e.runId)return state;
   return {...state,evaluation:{...e,phase:'cancelled',error:null}};
  }
  case 'SHARING_AVAILABLE':{
   const enabled=event.enabled===true;
   if(enabled===s.enabled)return state;
   return {...state,sharing:{enabled,phase:enabled?'idle':'unavailable',requestId:null,preparedRevision:null,error:null}};
  }
  case 'SHARE_PREPARE':{
   if(!s.enabled||!['idle','error','published'].includes(s.phase)||typeof event.requestId!=='string'||!event.requestId)return state;
   return {...state,sharing:{...s,phase:'prepared',requestId:event.requestId,preparedRevision:rev,error:null}};
  }
  case 'SHARE_SUBMIT':{
   if(!maySubmitShare(state)||event.requestId!==s.requestId||event.consent!==true||event.keySaved!==true)return state;
   return {...state,sharing:{...s,phase:'posting',error:null}};
  }
  case 'SHARE_SUCCESS':{
   if(s.phase!=='posting'||event.requestId!==s.requestId)return state;
   return {...state,sharing:{...s,phase:'published',error:null}};
  }
  case 'SHARE_FAILURE':{
   if(s.phase!=='posting'||event.requestId!==s.requestId)return state;
   return {...state,sharing:{...s,phase:'error',error:String(event.error??'unknown error')}};
  }
  case 'SHARE_RESET':{
   if(s.phase==='unavailable'||s.phase==='idle')return state;
   return {...state,sharing:{...s,phase:s.enabled?'idle':'unavailable',requestId:null,preparedRevision:null,error:null}};
  }
  default:return state;
 }
}
