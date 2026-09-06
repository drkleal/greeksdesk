import test from 'node:test';
import assert from 'node:assert/strict';
import {labelPositions} from '../public/map.mjs';

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
