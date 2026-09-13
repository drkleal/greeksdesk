// A successful transport response is not evidence that observations exist.
// Shared by ingestion, saved-read restrictions and freshness display.
export function noObservations(data={}) {
 if(!data||typeof data!=='object')return false;
 const counts=['rowCount','bucketCount','strikeCount','levelCount','expirationCount'];
 if(counts.some(key=>data[key]===0))return true;
 const arrays=['rows','buckets','levels','expirations'].filter(key=>Array.isArray(data[key]));
 return arrays.length>0&&arrays.every(key=>data[key].length===0);
}
export function observationAvailability(data) {
 return noObservations(data)?{...data,available:false,message:data.message||'No observations returned for the selected request.'}:data;
}
