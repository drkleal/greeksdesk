import test from 'node:test';
import assert from 'node:assert/strict';
import {labelPositions,renderMap} from '../public/map.mjs';

test('clustered ES labels stay distinct without changing their price positions',()=>{
 const prices=[76,161,315,326,337,348],before=[...prices];
 const labels=labelPositions(prices);
 assert.deepEqual(prices,before);
 assert.equal(labels.length,prices.length);
 assert.ok(labels[0]>=65&&labels.at(-1)<=380);
 for(let i=1;i<labels.length;i++)assert.ok(labels[i]-labels[i-1]>=50);
});
test('label spacing also handles identical levels and a single reference',()=>{
 const labels=labelPositions([200,200,200,200,200,200]);
 assert.ok(labels[0]>=65&&labels.at(-1)<=380);
 for(let i=1;i<labels.length;i++)assert.ok(labels[i]-labels[i-1]>=50);
 assert.deepEqual(labelPositions([200]),[200]);
 assert.deepEqual(labelPositions([]),[]);
});
test('staged routes retain checkpoint dots without adding map lines and both stages stay clickable',()=>{
 const element=()=>({attrs:{},children:[],events:{},classList:{remove(){},add(){}},setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(k,fn){this.events[k]=fn;}});
 const old=globalThis.document;globalThis.document={createElementNS:element};
 try{
  const levels=[{id:'a',price:7716,role:'structure',kind:'resistance',label:'Failed reclaim'},{id:'b',price:7722.75,role:'structure',kind:'resistance',label:'Shelf'}];
  const scenario={direction:'up',status:'conditional',triggerId:'a',targetId:'b',condition:'A reclaim holds'};
  const analysis={levels,scenarios:[scenario],checkpoints:[{id:'near',price:7717.75,role:'structure'}]};
  const host=element(),all=n=>[n,...n.children.flatMap(all)],arrows=()=>all(host).filter(n=>n.attrs['marker-end']);
  let selected=null;renderMap(host,analysis,'ES',()=>{},s=>selected=s);
  assert.equal(arrows().length,1);assert.equal(all(host).filter(n=>n.attrs.r===String(4)).length,1);
  assert.equal(all(host).filter(n=>n.attrs['aria-label']?.startsWith('Decision zone')).length,2);
  renderMap(host,{...analysis,checkpoints:[]},'ES',()=>{},s=>selected=s);
  assert.equal(arrows().length,1);all(host).find(n=>n.attrs['aria-label']?.includes('first conditional test:')).events.click();assert.equal(selected,scenario);
  const continuation={targetId:'c',condition:'After the first shelf holds',confirmation:'Acceptance above the checkpoint',invalidation:'Loss of reclaimed shelf',rationale:'Earlier 15-minute reaction'};
  const staged={...scenario,continuation};renderMap(host,{...analysis,levels:[...levels,{...levels[1],id:'c',price:7740}],scenarios:[staged]},'ES',()=>{},s=>selected=s);
  assert.equal(arrows().length,2);all(host).find(n=>n.attrs['aria-label']?.includes('continuation only after acceptance:')).events.click();assert.equal(selected,staged);
  renderMap(host,{...analysis,checkpoints:undefined},'ES',()=>{});assert.equal(arrows().length,0);
 }finally{globalThis.document=old;}
});
