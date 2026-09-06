export const evidencePolicyVersion=1;

export function sourceInstrument(source,panel){
 if(panel)return panel.instrument;
 if(source?.data?.ticker)return source.data.ticker;
 if(source?.id==='gamma'||/^qd-(gamma|delta|vanna|charm)$/.test(source?.id||''))return 'SPX';
 return null;
}

// These constraints also apply when opening a saved read in the browser.
export function evidenceConstraint(source,panel,packet){
 if(source?.data?.available===false||panel?.status==='excluded')return {effect:'unavailable',reason:'This source was unavailable or excluded from this read. It cannot confirm or oppose the setup.'};
 if(panel?.dateRole==='projected_session')return {effect:'context',reason:'Forward model for '+panel.observedDate+'; planning context only, not observed price response in the '+packet.date+' session.'};
 if(panel&&(panel.observedDate!==packet.date||panel.dateRole!=='observed_session'||panel.dateEvidence==='unknown'))return {effect:'context',reason:'The panel does not establish an observed date matching this session. Its values cannot confirm these price boundaries.'};
 const instrument=sourceInstrument(source,panel),mapped=instrument===packet.instrument||(packet.instrument==='ES'&&instrument==='SPX'&&Number.isFinite(packet.basis));
 if(!mapped)return {effect:'context',reason:instrument==='SPX'&&packet.instrument==='ES'?'SPX coordinates; no matched ES–SPX basis was supplied for this read. These prices cannot be located above, below or at the ES setup. See the source finding for the separate SPX observations.':(instrument||'Unidentified instrument')+' observations are separate context for this '+packet.instrument+' map, not matching price levels or confirmation of its boundaries.'};
 if(panel?.status==='context')return {effect:'context',reason:'This panel is classified as context. It does not independently establish the setup; see the panel finding for its scope and limitations.'};
 if(!panel&&(source?.id==='gamma'||/^qd-(gamma|delta|vanna|charm)$/.test(source?.id||'')))return {effect:'context',reason:'Exposure model context. Raw Greek signs and extrema alone do not establish dealer inventory, buying or selling, or a price response at this boundary. Confirmation must come from matching price evidence.'};
 return null;
}

export function enforceEvidenceScope(analysis,packet){
 for(const scenario of analysis.scenarios||[])for(const driver of scenario.drivers||[]){
  const source=packet.sources.find(s=>s.id===driver.sourceId),panel=driver.panelId?analysis.panels?.find(p=>p.id===driver.panelId&&p.sourceId===driver.sourceId):null;
  const restriction=evidenceConstraint(source,panel,packet);
  if(restriction)Object.assign(driver,restriction);
 }
 for(const finding of analysis.sources||[]){
  const source=packet.sources.find(s=>s.id===finding.id);
  if(!source?.data||source.image)continue;
  const restriction=evidenceConstraint(source,null,packet);
  if(restriction)finding.priceEffect=restriction.reason;
 }
 return analysis;
}

export function evidenceMetadata(source,panel){
 const instrument=sourceInstrument(source,panel)||'Instrument not supplied';
 if(panel)return instrument+' · '+(panel.dateRole==='projected_session'?'Model date ':panel.dateRole==='observed_session'?'Observed session ':'Date unverified ')+(panel.observedDate||'unknown');
 if(source.id==='timestamps')return 'Model availability · '+source.sessionDate;
 return instrument+' · Session '+source.sessionDate;
}

export function chartDateCaption(source){
 const panel=source.panelContext;
 const capture=source.capturedAt?'Captured '+new Date(source.capturedAt).toLocaleString():'Capture time unavailable';
 if(!panel)return 'Analysis session '+source.sessionDate+' · '+capture+'. The chart’s displayed date must be checked separately.';
 const role=panel.dateRole==='projected_session'?'Displayed model date ':panel.dateRole==='observed_session'?'Observed chart session ':'Chart date unverified ';
 return role+(panel.observedDate||'unknown')+(panel.dateRole==='projected_session'?' · Forward model':'')+' · Analysis session '+source.sessionDate+' · '+capture;
}
