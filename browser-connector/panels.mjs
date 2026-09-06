// Only chart titles and rendered rectangles leave the selected provider tab.
// No account state, input values, cookies, storage or network responses are read.
export function readVisiblePanels(){
 const width=window.innerWidth,height=window.innerHeight;
 const candidates=[];
 if(location.hostname==='v3.quantdata.us'){
  for(const element of document.querySelectorAll('.flexlayout__tabset')){
   const heading=element.querySelector('.flexlayout__tab_button--selected [class*="__tabName"]');
   const title=heading?.textContent?.trim();
   if(title)candidates.push({element,title});
  }
 }else if(location.hostname==='app.optionsdepth.com'){
  for(const element of document.querySelectorAll('[class*="_chartWrapper_"]')){
   const title=element.innerText?.split('\n').map(s=>s.trim()).find(Boolean);
   if(title)candidates.push({element,title});
  }
 }
 const panels=[];
 for(const {element,title} of candidates){
  const r=element.getBoundingClientRect(),style=getComputedStyle(element);
  if(style.display==='none'||style.visibility==='hidden'||r.width<100||r.height<100)continue;
  const left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(width,r.right),bottom=Math.min(height,r.bottom);
  if(right-left<100||bottom-top<100)continue;
  panels.push({id:'panel-'+panels.length,title:title.slice(0,100),region:{x:left/width,y:top/height,width:(right-left)/width,height:(bottom-top)/height},complete:left===r.left&&top===r.top&&right===r.right&&bottom===r.bottom});
  if(panels.length===16)break;
 }
 return {width,height,panels};
}
export async function capturePanelLayout(api,target){
 const response=await api.debugger.sendCommand(target,'Runtime.evaluate',{expression:'('+readVisiblePanels.toString()+')()',returnByValue:true});
 const value=response?.result?.value;
 if(response.exceptionDetails||!value||!Number.isFinite(value.width)||!Number.isFinite(value.height)||!Array.isArray(value.panels))throw Error('Unable to identify chart panel boundaries.');
 return value;
}
