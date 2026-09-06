// NYSE published cash-session calendar: https://www.nyse.com/trade/hours-calendars
// Limit automatic basis matching to the years whose holiday schedule is listed here.
const holidays = new Set([
 '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
 '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
 '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25'
]);
const earlyCloses = new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
const formatter = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function nyTime(value=new Date()) {
 const instant=new Date(value); if(!Number.isFinite(instant.getTime()))return null;
 const p=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,seconds:Number(p.hour)*3600+Number(p.minute)*60+Number(p.second)};
}
export const today=()=>nyTime().date;
const shiftDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
// Futures trade after 18:00 ET belongs to the following calendar session.
export function esSessionDate(now=new Date()) {const p=nyTime(now);return p.seconds>=18*3600?shiftDate(p.date,1):p.date;}
export function esSessionBounds(date){
 if(!validDate(date))throw Error('Invalid ES session date');
 const localInstant=(day,hour)=>{const wall=Date.parse(day+'T'+String(hour).padStart(2,'0')+':00:00Z'),p=nyTime(wall),localWall=Date.parse(p.date+'T00:00:00Z')+p.seconds*1000;return new Date(wall+(wall-localWall)).toISOString();};
 return {start:localInstant(shiftDate(date,-1),18),end:localInstant(date,17)};
}
export function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;}
export function cashSession(date){
 if(!validDate(date)||date<'2026-01-01'||date>'2028-12-31')return null;
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 if(weekday===0||weekday===6||holidays.has(date))return null;
 return {open:9.5*3600,close:(earlyCloses.has(date)?13:16)*3600};
}
export function isCashObservation(timestamp,date){const time=nyTime(timestamp),hours=cashSession(date);return Boolean(time&&hours&&time.date===date&&time.seconds>=hours.open&&time.seconds<=hours.close);}
export function defaultSession(now=new Date()){
 const date=nyTime(now).date;
 if(date<'2026-01-01'||date>'2028-12-31')return date;
 for(let i=0;i<10;i++){const candidate=new Date(Date.parse(date)-i*86400000).toISOString().slice(0,10);if(cashSession(candidate))return candidate;}
 return date;
}
export function initialSession(saved,now=new Date()){
 return saved?.savedOn===nyTime(now).date&&validDate(saved.date)?saved.date:defaultSession(now);
}
