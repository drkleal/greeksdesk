export function isChart(url){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return false;return (u.hostname==='v3.quantdata.us'&&(u.pathname==='/'||u.pathname.startsWith('/page/')))||(u.hostname==='app.optionsdepth.com'&&['/dashboard','/market-makers','/positional-insight','/depth-view','/iv-depth'].includes(u.pathname.replace(/\/$/,'')));}catch{return false;}}
export function isDesk(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&['greeksdesk.drklealtrades.com','greeksdesk.fly.dev'].includes(u.hostname)&&['/','/index.html'].includes(u.pathname);}catch{return false;}}
export async function captureTab(api,id){
 const before=await api.tabs.get(id);if(!isChart(before.url))throw Error('A connected tab is no longer on a supported chart page.');if(before.discarded||before.status==='loading')throw Error('Open the chart and let it finish loading before updating.');
 const target={tabId:id};let attached=false;
 try{
  await api.debugger.attach(target,'1.3');attached=true;
  const shot=await api.debugger.sendCommand(target,'Page.captureScreenshot',{format:'jpeg',quality:80,fromSurface:true,captureBeyondViewport:false});
  const after=await api.tabs.get(id);if(!isChart(after.url)||after.url!==before.url||after.status==='loading')throw Error('Chart navigated during capture. Try updating after it finishes.');
  if(typeof shot?.data!=='string'||shot.data.length>6000000)throw Error('Chart image is too large. Reduce the chart window size.');
  return {id:'connected-'+id,title:(after.title||'Connected chart').slice(0,100),url:after.url,capturedAt:new Date().toISOString(),image:'data:image/jpeg;base64,'+shot.data};
 }finally{if(attached)await api.debugger.detach(target).catch(()=>{});}
}
