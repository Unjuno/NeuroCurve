/** Bounded mathematical parser. No eval, generated code, property access or globals. */
export const FUNCTIONS = ['sin','cos','tanh','sigmoid','swish','gelu','softplus','exp','log','sqrt','abs','relu'];
export const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
export function unary(name,v,d=1){
  switch(name){
    case 'sin':return [Math.sin(v),Math.cos(v)*d];
    case 'cos':return [Math.cos(v),-Math.sin(v)*d];
    case 'tanh':{const t=Math.tanh(v);return [t,(1-t*t)*d];}
    case 'sigmoid':{const s=sigmoid(v);return [s,s*(1-s)*d];}
    case 'swish':{const s=sigmoid(v);return [v*s,(s+v*s*(1-s))*d];}
    case 'gelu':{const k=Math.sqrt(2/Math.PI),t=Math.tanh(k*(v+.044715*v*v*v));return [.5*v*(1+t),(.5*(1+t)+.5*v*(1-t*t)*k*(1+.134145*v*v))*d];}
    case 'softplus':return [Math.max(0,v)+Math.log1p(Math.exp(-Math.abs(v))),sigmoid(v)*d];
    case 'exp':{const e=Math.exp(v);return [e,e*d];}
    case 'log':return [Math.log(v),d/v];
    case 'sqrt':{const s=Math.sqrt(v);return [s,d/(2*s)];}
    case 'abs':return [Math.abs(v),Math.sign(v)*d];
    case 'relu':return [Math.max(0,v),v>0?d:0];
    default:throw new Error('許可されていない関数です。');
  }
}
export function parseExpression(text){
  if(typeof text!=='string'||text.length===0||text.length>1024)throw new Error('数式は1〜1024文字にしてください。');
  const tokens=[];let pos=0;
  while(pos<text.length){const rest=text.slice(pos);const m=/^(\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-zA-Z_][a-zA-Z_0-9]*|[+\-*/^()])/i.exec(rest);if(!m)throw new Error(`数式の${pos+1}文字目は使用できません。`);pos+=m[0].length;if(!/^\s/.test(m[0]))tokens.push(m[0]);}
  let idx=0,count=0;
  const node=(v)=>{if(++count>64)throw new Error('数式は64ノード以内にしてください。');return v;};
  function parse(min=0,depth=0){
    if(depth>16)throw new Error('数式の入れ子は16段以内にしてください。');
    let t=tokens[idx++],a;
    if(t==='+'||t==='-')a=node({op:t==='-'?'neg':'pos',a:parse(25,depth+1)});
    else if(t==='('){a=parse(0,depth+1);if(tokens[idx++]!==')')throw new Error('閉じ括弧がありません。');}
    else if(t==='x')a=node({op:'x'});
    else if(t==='pi'||t==='e')a=node({op:'num',value:t==='pi'?Math.PI:Math.E});
    else if(t&&/^\d|^\./.test(t)){const value=Number(t);if(!Number.isFinite(value)||Math.abs(value)>1e6)throw new Error('数値の範囲外です。');a=node({op:'num',value});}
    else if(FUNCTIONS.includes(t)){if(tokens[idx++]!=='(')throw new Error('関数には括弧が必要です。');a=node({op:t,a:parse(0,depth+1)});if(tokens[idx++]!==')')throw new Error('閉じ括弧がありません。');}
    else throw new Error(`使用できない記号: ${t??'数式の終端'}`);
    while(idx<tokens.length){const op=tokens[idx],bp=({'+':10,'-':10,'*':20,'/':20,'^':30})[op];if(bp===undefined||bp<min)break;idx++;const b=parse(op==='^'?bp:bp+1,depth+1);a=node({op,a,b});if(op==='^'){if(hasX(b))throw new Error('指数は定数にしてください。');const n=compileExpression(b)(0)[0];if(!Number.isFinite(n)||Math.abs(n)>16)throw new Error('指数の絶対値は16以下にしてください。');}}
    return a;
  }
  const ast=parse();if(idx!==tokens.length)throw new Error('演算子または括弧を確認してください。');return ast;
}
function hasX(n){return n.op==='x'||!!(n.a&&hasX(n.a))||!!(n.b&&hasX(n.b));}
export function compileExpression(ast){
  function build(n){
    if(n.op==='x')return x=>[x,1];
    if(n.op==='num')return ()=>[n.value,0];
    const a=build(n.a);
    if(n.op==='neg')return x=>{const [v,d]=a(x);return [-v,-d];};
    if(n.op==='pos')return a;
    if(FUNCTIONS.includes(n.op))return x=>{const [v,d]=a(x);return unary(n.op,v,d);};
    const b=build(n.b);
    if(n.op==='^'){const power=b(0)[0];return x=>{const [v,d]=a(x);return [Math.pow(v,power),power===0?0:power*Math.pow(v,power-1)*d];};}
    return x=>{const [av,ad]=a(x),[bv,bd]=b(x);switch(n.op){case '+':return [av+bv,ad+bd];case '-':return [av-bv,ad-bd];case '*':return [av*bv,ad*bv+av*bd];case '/':return [av/bv,(ad*bv-av*bd)/(bv*bv)];default:throw new Error('不正な構文木です。');}};
  }
  return build(ast);
}
