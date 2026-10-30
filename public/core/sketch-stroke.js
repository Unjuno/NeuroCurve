/** Convert a pen stroke to the strictly increasing x-domain required by f(x).
 * Minor reverse motions and repeated x samples are normal for mice and touch pens.
 * Do not treat a loop as a multi-valued curve: nearby x positions are averaged.
 */
export function normalizeStrokePoints(samples,{maxPoints=512}={}){
 if(!Array.isArray(samples)||samples.length<2)throw new Error('手描きには2点以上必要です。');
 if(!Number.isInteger(maxPoints)||maxPoints<2||maxPoints>512)throw new Error('制御点上限が不正です。');
 const sorted=samples.map(p=>{
  if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new Error('手描きに不正な数値があります。');
  return [p[0],p[1]];
 }).sort((a,b)=>a[0]-b[0]);
 const span=sorted.at(-1)[0]-sorted[0][0];
 if(span<1e-4)throw new Error('横方向の幅が足りません。左右に動かして曲線を描いてください。');
 const epsilon=Math.max(1e-12,span*1e-8),groups=[];
 for(const point of sorted){
  const previous=groups.at(-1);
  if(previous&&point[0]-previous.maxX<=epsilon){
   previous.sumX+=point[0];previous.sumY+=point[1];previous.n++;previous.maxX=point[0];
  }else groups.push({sumX:point[0],sumY:point[1],n:1,maxX:point[0]});
 }
 const points=groups.map(g=>[g.sumX/g.n,g.sumY/g.n]);
 if(points.length<2)throw new Error('異なる入力位置の点が必要です。');
 if(points.length<=maxPoints)return points;
 // Deterministic, endpoint-preserving reduction. No stochastic resampling.
 return Array.from({length:maxPoints},(_,i)=>points[Math.floor(i*(points.length-1)/(maxPoints-1))]);
}
