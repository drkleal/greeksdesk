import {node} from './map.mjs';
import {evidenceCoverage} from './evidence.mjs';
import {priceEvidence} from './price-evidence.mjs';
import {scenarioRoute,priceText} from './plan.mjs';
import {confluenceLabel,levelConfluence} from './confluence.mjs';

export function verificationStatus(read){
 const a=read.result.analysis,coverage=evidenceCoverage(read);
 const levels=[...(a.levels||[]),...(a.checkpoints||[])];
 const cited=levels.filter(l=>l.apiOrigin),matched=cited.filter(l=>priceEvidence(l,read.sources));
 const routes=(a.scenarios||[]).map(s=>({direction:s.direction,ready:scenarioRoute(s,a.levels,a.checkpoints).ready}));
 const stars=(a.levels||[]).filter(l=>l.role==='structure').map(l=>({id:l.id,price:l.price,...confluenceLabel(levelConfluence(read,l))}));
 return {total:coverage.length,findings:coverage.filter(i=>!['not-reviewed','unavailable'].includes(i.status)).length,
  unavailable:coverage.filter(i=>i.status==='unavailable').length,pending:coverage.filter(i=>i.status==='not-reviewed').length,
  partial:coverage.filter(i=>i.status==='partial').length,forward:coverage.filter(i=>i.status==='forward-model').length,
  cited:cited.length,matched:matched.length,routes,stars,outcomeValidated:false};
}

export function renderVerification(read,{inspectLevel}={}){
 const v=verificationStatus(read),box=node('details',undefined,'wb-verification'),summary=node('summary');
 summary.append(node('strong','Plan verification'),node('span',v.findings+'/'+v.total+' source findings'),node('span',v.matched+'/'+v.cited+' cited ES prices matched'),node('span','Trading edge: not established','wb-unvalidated'));
 box.append(summary);
 const grid=node('div',undefined,'wb-verification-grid');
 const section=(title,text)=>{const c=node('section');c.append(node('h3',title),node('p',text));grid.append(c);return c;};
 section('1 · Source and price checks',v.findings+' returned findings; '+v.pending+' awaiting analysis, '+v.unavailable+' unavailable, '+v.partial+' partial and '+v.forward+' forward-model views. '+v.matched+' of '+v.cited+' cited native ES prices match the saved source bars or trade profile. A returned finding is an analysis record, not independent confirmation that its interpretation is correct.');
 section('2 · Conditional scenarios',v.routes.filter(s=>s.ready).length+' of '+v.routes.length+' scenarios have ordered structural routes. This checks their cited boundaries and direction, not whether a trigger occurred. Entry timing, invalidation and intervening levels still matter. A route distance is not expected profit.');
 const star=section('3 · Confluence on each level','★ means three supporting families; ★★ means four or more. Repeated views count once. Conflicts and dated model context are retained in the evidence inspector. These stars do not measure win probability.');
 for(const l of v.stars){const b=node('button',priceText(l.price)+(l.stars?' '+l.stars:'')+' · '+l.count+' supporting '+(l.count===1?'family':'families')+(l.text?' · '+l.text:''));b.type='button';b.onclick=()=>inspectLevel?.(read.result.analysis.levels.find(x=>x.id===l.id));star.append(b);}
 section('4 · Outcome validation pending','This app has not established a win rate or trading edge. These historical reviews can contain observations from the whole session and are not an unbiased backtest. A valid performance study must freeze each plan before its trigger, then score every qualifying setup and failure using later data, declared fees and slippage.');
 box.append(grid);return box;
}
