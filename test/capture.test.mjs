import test from 'node:test';
import assert from 'node:assert/strict';
import {chartImageBlob} from '../public/capture.mjs';
test('saved chart bytes reopen locally without a network fetch',async()=>{
 const image='data:image/png;base64,iVBORw0KGgo=';
 const blob=chartImageBlob(image);
 assert.equal(blob.type,'image/png');
 assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[137,80,78,71,13,10,26,10]);
 for(const bad of ['https://example.com/chart.png','data:text/html;base64,aGVsbG8=',null])assert.throws(()=>chartImageBlob(bad),/saved chart/);
});
