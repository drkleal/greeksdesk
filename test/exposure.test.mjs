import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('Gamma uses latest initial slot and stays locked through timestamp refresh during a paid request',async()=>{
 const elements=new Map();
 function element(){return {value:'',dataset:{},options:[],disabled:false,textContent:'',listeners:{},reportValidity:()=>true,replaceChildren(){this.options=[];this.value='';},append(option){this.options.push(option);},addEventListener(name,fn){this.listeners[name]=fn;},set selectedIndex(index){this.value=this.options[index].value;}};}
 for(const id of ['gamma-slot','gamma-check','date','gamma-output','gamma-table','gamma-min','gamma-max'])elements.set(id,element());
 const get=id=>elements.get(id);get('date').value='2026-09-04';get('gamma-min').value='7700';get('gamma-max').value='7800';
 let requests=0,finish;
 const context={document:{getElementById:get,createElement:element},window:{},URLSearchParams,fetch:()=>{requests++;return new Promise(resolve=>finish=resolve);}};
 vm.runInNewContext(await readFile(new URL('../public/exposure.js',import.meta.url),'utf8'),context);
 const slots=['2026-09-04T10:00:00','2026-09-04T11:00:00'];
 context.window.setGammaSlots(slots,'2026-09-04');assert.equal(get('gamma-slot').value,slots[1]);
 const running=get('gamma-check').listeners.click();
 context.window.setGammaSlots([...slots,'2026-09-04T12:00:00'],'2026-09-04');
 assert.equal(get('gamma-check').disabled,true);assert.equal(get('gamma-slot').value,slots[1]);
 await get('gamma-check').listeners.click();assert.equal(requests,1);
 finish({json:async()=>({ok:false,message:'Sample unavailable'})});await running;
 assert.equal(get('gamma-check').disabled,false);assert.equal(get('gamma-min').disabled,false);
});
