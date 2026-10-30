import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStrokePoints} from '../public/core/sketch-stroke.js';
import {validateDefinition,compileDefinition} from '../public/core/activation.js';

function asFunction(points){
 const domain=[points[0][0],points.at(-1)[0]];
 return validateDefinition({schema:1,engine:'neurocurve-1',kind:'sketch',points,domain});
}

test('freehand stroke tolerates brief x-direction reversals and produces evaluable PCHIP',()=>{
 const input=[[-2,0],[-1.4,.3],[-1.45,.4],[-.5,-.6],[0,0],[1,1.2],[2,.6]];
 const normalized=normalizeStrokePoints(input);
 assert.ok(normalized.every((p,i)=>i===0||p[0]>normalized[i-1][0]));
 const def=asFunction(normalized);
 assert.ok(Number.isFinite(compileDefinition(def)(-.5)[0]));
 assert.equal(normalized.length,input.length);
});

test('right-to-left drawing produces identical x-sorted geometry',()=>{
 const input=[[-2,0],[-1,1],[0,-1],[1,1],[2,0]];
 assert.deepEqual(normalizeStrokePoints([...input].reverse()),normalizeStrokePoints(input));
});

test('duplicate and near-equal x values are merged, preserving finite average y',()=>{
 const normalized=normalizeStrokePoints([[0,0],[.00000000001,2],[.5,1],[1,2]]);
 assert.equal(normalized.length,3);
 assert.ok(Math.abs(normalized[0][1]-1)<1e-9);
 assert.doesNotThrow(()=>asFunction(normalized));
});

test('long stroke is reduced to 512 control points while retaining endpoints',()=>{
 const input=Array.from({length:1500},(_,i)=>[-3+6*i/1499,Math.sin(i/30)]);
 const normalized=normalizeStrokePoints(input);
 assert.equal(normalized.length,512);
 assert.equal(normalized[0][0],-3);
 assert.equal(normalized.at(-1)[0],3);
 assert.doesNotThrow(()=>asFunction(normalized));
});

test('vertical stroke and non-finite samples fail clearly',()=>{
 assert.throws(()=>normalizeStrokePoints([[1,0],[1,1],[1,2]]),/横方向|幅/);
 assert.throws(()=>normalizeStrokePoints([[0,0],[NaN,1],[1,2]]),/数値/);
});
