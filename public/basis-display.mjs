import {conversionFor, signed} from './confluence.mjs';
import {selectESSource,priceText} from './plan.mjs';
import {node} from './map.mjs';
export function renderBasisDisplay(host,read){
 host.replaceChildren();host.hidden=read.instrument!=='ES';if(host.hidden)return;
 const conversion=conversionFor(read),feed=selectESSource(read.sources)?.data;
 host.append(node('strong','SPX → ES conversion'));
 if(conversion.kind==='unmapped'){host.append(node('p','Checking for matched prices. A prior-close estimate will appear here when verified; live ES prices do not require conversion.'));return;}
 const r=conversion.reference||feed?.basisResult,b=conversion.basis,approx=conversion.kind==='anchor';
 host.append(node('p',(approx?'Estimated premarket / after-hours conversion: ':'Matched conversion: ')+'ES '+(approx?'≈':'=')+' SPX '+signed(b)+' points.'));
 if(r?.esTime&&r?.spxTime){const time=t=>new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET';host.append(node('small',(r.contract||feed?.contract)+' '+priceText(r.esPrice)+' at '+time(r.esTime)+' − SPX '+priceText(r.spxPrice)+' at '+time(r.spxTime)+(approx?'. Historical difference; today’s basis can change. Approximate overlays do not confirm a trade.':'. Recalculated on data updates.')));}
 const label=node('label','Convert an SPX level '),input=node('input'),output=node('output');input.type='number';input.step='0.25';input.min='1';input.placeholder='Enter SPX level';input.setAttribute('aria-label','SPX level to convert');output.setAttribute('aria-live','polite');label.append(input);host.append(label,output);
 input.addEventListener('input',()=>{const value=Number(input.value);output.textContent=input.value&&Number.isFinite(value)&&value>0?' → '+(approx?'≈ ':'')+priceText(Math.round((value+b)*4)/4)+' ES (nearest tick)':'';});
}
