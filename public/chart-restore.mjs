// Restore only the selected session; a late read must not replace a newer paste.
export function createChartRestore({load,accept,currentDate,locked,versions,onRestored}){
 let generation=0,pending=Promise.resolve();
 function restore(){
  const token=++generation,date=currentDate(),before=new Map(versions);
  pending=(async()=>{
   const drafts=await load(date);let count=0;
   for(const source of drafts){
    if(token!==generation||currentDate()!==date||locked())break;
    if(source.sessionDate!==date||versions.get(source.id)!==before.get(source.id))continue;
    if(await accept(source)){onRestored(source);count++;}
   }
   return count;
  })();
  return pending;
 }
 return {restore,whenReady:()=>pending};
}
