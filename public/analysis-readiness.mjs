export function analysisReadiness(sources,instrument,date){
 const selected=sources.filter(s=>s.sessionDate===date);
 const images=selected.filter(s=>s.image).length;
 const es=selected.find(s=>s.id==='databento')?.data;
 const nativeES=es?.available===true&&es.ticker==='ES'&&es.dataset==='GLBX.MDP3'&&/^ES[HMUZ]\d{1,2}$/.test(es.contract)&&Array.isArray(es.recentBars)&&(es.recentBars.length>0||es.priorContext?.available===true);
 if(images||nativeES)return {ready:true,images};
 return {ready:false,images:0,message:'Full analysis not started: no chart images are attached for '+date+(instrument==='ES'?' and usable ES price history is unavailable. Paste your matching-date DeepCharts image into the DeepCharts box, then press Update & analyze. The available options data will be included.':'. Paste your matching-date chart, then press Update & analyze. The available API data will be included.')};
}
