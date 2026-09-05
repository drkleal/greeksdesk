const slotSelect=document.getElementById('gamma-slot');
const gammaButton=document.getElementById('gamma-check');
let gammaPending=false;
window.setGammaSlots=(slots,session)=>{
 const previousSlot=slotSelect.value;
 slotSelect.replaceChildren();
 for(const slot of slots.filter(s=>s.startsWith(session+'T')).sort()){
  const option=document.createElement('option');option.value=slot;option.textContent=slot.replace('T',' ');slotSelect.append(option);
 }
 gammaButton.disabled=gammaPending||!slotSelect.options.length;
 if(Array.from(slotSelect.options).some(option=>option.value===previousSlot))slotSelect.value=previousSlot;
 else if(slotSelect.options.length)slotSelect.selectedIndex=slotSelect.options.length-1;
 slotSelect.dataset.session=session;
};
document.getElementById('date').addEventListener('change',()=>{slotSelect.replaceChildren();gammaButton.disabled=true;document.getElementById('gamma-output').textContent='Date changed. Check OptionsDepth timestamps again.';document.getElementById('gamma-table').replaceChildren();});
gammaButton.addEventListener('click',async()=>{
 if(gammaPending)return;
 const min=document.getElementById('gamma-min'),max=document.getElementById('gamma-max'),out=document.getElementById('gamma-output'),table=document.getElementById('gamma-table');
 if(!min.reportValidity()||!max.reportValidity())return;
 if(Number(max.value)<=Number(min.value)||Number(max.value)-Number(min.value)>300){out.textContent='Choose a positive range of at most 300 SPX points.';return;}
 if(slotSelect.dataset.session!==document.getElementById('date').value||!slotSelect.value){out.textContent='Check timestamps for this date first.';return;}
 const requestedSession=slotSelect.dataset.session;
 gammaPending=true;gammaButton.disabled=true;slotSelect.disabled=true;min.disabled=true;max.disabled=true;out.textContent='Fetching one Gamma sample…';table.replaceChildren();
 try{
  const query=new URLSearchParams({provider:'optionsdepth-gamma',date:slotSelect.dataset.session,slot:slotSelect.value,min:min.value,max:max.value});
  const response=await fetch('/api/check?'+query,{method:'POST',headers:{'X-GreeksDesk-Action':'manual-check'}});
  const result=await response.json();if(document.getElementById('date').value!==requestedSession){out.textContent='Session changed during request. The paid request was for '+requestedSession+'; its result is not shown for the newly selected date.';return;}out.textContent=result.message;
  if(result.cached)out.textContent+=' Reused a recent result on this machine; no new request.';
  if(!result.ok)return;
  out.textContent+='\nRequested model timestamp: '+result.requestedSlot+' (provider timezone)\nSPX range: '+result.range.join('–')+' · '+result.count+' rows\nRetrieved: '+new Date(result.checkedAt).toLocaleString();
  const largest=Math.max(1,...result.rows.map(r=>Math.abs(r.value)));
  const head=document.createElement('tr');for(const label of ['SPX price','Gamma model value','Relative size','Effective time returned']){const cell=document.createElement('th');cell.textContent=label;head.append(cell);}table.append(head);
  for(const row of result.rows){const tr=document.createElement('tr');const price=document.createElement('td');price.textContent=row.price.toLocaleString();const value=document.createElement('td');value.textContent=row.value.toLocaleString(undefined,{maximumFractionDigits:6});value.style.color=row.value<0?'#ff668e':'#20ffc0';const graphic=document.createElement('td');const bar=document.createElement('span');bar.className='gamma-bar';bar.style.width=(Math.abs(row.value)/largest*100)+'%';bar.style.background=row.value<0?'#ff668e':'#20ffc0';graphic.append(bar);const time=document.createElement('td');time.textContent=row.effectiveDatetime;tr.append(price,value,graphic,time);table.append(tr);}
 }catch{out.textContent='Unable to load the sample. No automatic retry was made.';}finally{gammaPending=false;slotSelect.disabled=false;min.disabled=false;max.disabled=false;gammaButton.disabled=!slotSelect.value;}
});
