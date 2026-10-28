import {deflateSync} from 'node:zlib';import {compileDefinition} from '../public/core/activation.js';
// PNG encoder uses only bounded numeric raster operations. Never renders user HTML.
const crcTable=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(b){let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return b;}
export function graphPNG(def){
  const W=1200,H=630,raw=Buffer.alloc((W*3+1)*H,255);for(let y=0;y<H;y++)raw[y*(W*3+1)]=0;
  const pixel=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;const i=y*(W*3+1)+1+x*3;raw[i]=c[0];raw[i+1]=c[1];raw[i+2]=c[2];};
  const line=(x0,y0,x1,y1,c,w=1)=>{if(![x0,y0,x1,y1].every(Number.isFinite))return;const n=Math.min(3000,Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0))));for(let i=0;i<=n;i++){const t=n?i/n:0;for(let d=-Math.floor(w/2);d<=Math.floor(w/2);d++)pixel(x0+(x1-x0)*t,y0+(y1-y0)*t+d,c);}};
  const f=compileDefinition(def),[a,b]=def.domain,ys=Array.from({length:801},(_,i)=>f(a+(b-a)*i/800)[0]);const finite=ys.filter(Number.isFinite);let lo=Math.min(0,...finite),hi=Math.max(1,...finite);const margin=(hi-lo)*.12;lo-=margin;hi+=margin;const X=x=>60+(W-120)*(x-a)/(b-a),Y=y=>H-50-(H-100)*(y-lo)/(hi-lo);
  for(let i=0;i<=12;i++)line(60+(W-120)*i/12,50,60+(W-120)*i/12,H-50,[228,234,238]);for(let i=0;i<=6;i++)line(60,50+(H-100)*i/6,W-60,50+(H-100)*i/6,[228,234,238]);
  if(a<=0&&b>=0)line(X(0),50,X(0),H-50,[142,155,167]);if(lo<=0&&hi>=0)line(60,Y(0),W-60,Y(0),[142,155,167]);
  for(let i=1;i<ys.length;i++)if(Number.isFinite(ys[i-1])&&Number.isFinite(ys[i]))line(X(a+(b-a)*(i-1)/800),Y(ys[i-1]),X(a+(b-a)*i/800),Y(ys[i]),[5,127,115],4);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
