import {validDate,nyTime} from './public/session.mjs';

// An explicit chart-owner statement supplies cropped metadata, never price levels.
export function validateChartContext(context,date){
 if(context==null)return null;
 if(context.instrument!=='ES'||context.sessionDate!==date||!validDate(date)||context.timezone!=='America/New_York')throw Error('Check the confirmed ES chart session.');
 const priceTime=context.priceTime??null;
 if(priceTime!==null&&(typeof priceTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(priceTime)))throw Error('Use a valid New York chart time.');
 return {instrument:'ES',sessionDate:date,priceTime,timezone:'America/New_York'};
}

export function confirmedTimestamp(context){
 if(!context?.priceTime)return null;
 const [hour,minute]=context.priceTime.split(':').map(Number),seconds=hour*3600+minute*60;
 // Try both NY offsets and verify the local result, including DST transitions.
 const matches=[4,5].map(offset=>new Date(Date.parse(context.sessionDate+'T'+context.priceTime+':00Z')+offset*3600000).toISOString()).filter(t=>{const local=nyTime(t);return local?.date===context.sessionDate&&local.seconds===seconds;});
 return matches.length===1?matches[0]:null;
}
