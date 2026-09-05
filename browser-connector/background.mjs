import {isChart,isDesk,captureTab} from './policy.mjs';
let capturing=false;
async function handle(message,sender){
 const popup=sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('popup.html');
 const desk=sender.id===chrome.runtime.id&&sender.frameId===0&&isDesk(sender.tab?.url)&&isDesk(sender.url);
 if(!popup&&!desk)throw Error('Only your GreeksDesk page may request chart captures.');
 const {targets=[]}=await chrome.storage.session.get('targets');
 if(message.type==='status')return {ok:true,count:targets.length,version:'0.1.0'};
 if(message.type==='list'&&popup){const tabs=(await chrome.tabs.query({})).filter(t=>isChart(t.url)).map(t=>({id:t.id,title:t.title,url:t.url,selected:targets.includes(t.id)}));return {ok:true,tabs};}
 if(message.type==='select'&&popup){if(!Array.isArray(message.ids)||message.ids.length>4||new Set(message.ids).size!==message.ids.length||message.ids.some(id=>!Number.isInteger(id)))throw Error('Choose up to four charts.');for(const id of message.ids)if(!isChart((await chrome.tabs.get(id)).url))throw Error('Select supported chart tabs only.');await chrome.storage.session.set({targets:message.ids});return {ok:true,count:message.ids.length};}
 if(message.type==='disconnect'){await chrome.storage.session.set({targets:[]});return {ok:true,count:0};}
 if(message.type!=='capture'||!desk)throw Error('Unknown request.');
 if(capturing)throw Error('A chart capture is already running.');if(!targets.length)throw Error('Choose your chart tabs in the GreeksDesk Chart Connector extension.');
 capturing=true;try{const charts=[];for(const id of targets)charts.push(await captureTab(chrome,id));return {ok:true,charts};}finally{capturing=false;}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{handle(message,sender).then(respond).catch(error=>respond({ok:false,message:error.message||'Chart capture failed.'}));return true;});
chrome.tabs.onRemoved.addListener(async id=>{const {targets=[]}=await chrome.storage.session.get('targets');await chrome.storage.session.set({targets:targets.filter(x=>x!==id)});});
