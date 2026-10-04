import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import firebaseConfig from './firebase-config.js';
import { tally, normalizeApi, emptyApi, lastYearProblems, lastYearCells } from './api_tally.js';
import { initApiUi, renderApiLists, renderApiValues } from './api_ui.js';
import { parseDob, dobWords, fieldProblems, migrateDraft } from './acr_fields.js';
import * as sessions from './sessions.js';
import { initLastYearUi, renderLastYear } from './last_year_ui.js';
import { generateDocx, ProblemsError } from './docx_engine.js';
import { acrFileName } from './file_names.js';
import googleConfig from './google-config.js';
import { loadGis, createTokenSource, createDrive, FOLDER_NAME } from './google_drive.js';
import { shareFiles, downloadFile } from './share.js';

// Browser storage, wrapped so that a storage error never loses what is on screen.
function safeStore(){
  let ls=null; try{ls=window.localStorage;}catch(err){console.error(err);}
  const fail=err=>{console.error(err);const s=document.getElementById('syncStatus');if(s)s.textContent="This browser's storage could not be used; your entries stay on screen but are not saved. Use Export Draft to keep a copy.";};
  const guard=(fn,fallback)=>{try{return ls?fn():fallback;}catch(err){fail(err);return fallback;}};
  return {get length(){return guard(()=>ls.length,0);},key:i=>guard(()=>ls.key(i),null),getItem:k=>guard(()=>ls.getItem(k),null),setItem:(k,v)=>guard(()=>ls.setItem(k,v)),removeItem:k=>guard(()=>ls.removeItem(k))};
}
const store=safeStore();
const state={session:'', profile:{}, part1:{}, part2:{}, teaching:[], assignments:[], results:[], activities:[], orientation:[], research:[], otherInfo:[], api:emptyApi(), enclosures:[], ui:{section:'profile'}};
let auth=null, db=null, firebaseReady=false, currentUser=null;

try {
  if(firebaseConfig?.apiKey && firebaseConfig.apiKey!=='YOUR_API_KEY'){
    const app=initializeApp(firebaseConfig); auth=getAuth(app); db=getFirestore(app); firebaseReady=true;
  }
}catch(err){ console.warn('Firebase not configured:', err); }

const $=id=>document.getElementById(id);
const form=$('acrForm');
const SHOW_FIREBASE_SIGNIN=false; // header Google/Firebase sign-in is kept for the later cloud-sessions work
const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const googleReady=Boolean(googleConfig?.clientId)&&!googleConfig.clientId.startsWith('YOUR_');
const googleTokens=googleReady?createTokenSource({clientId:googleConfig.clientId,gis:loadGis}):null;
const drive=googleReady?createDrive({fetch:(...a)=>fetch(...a),getToken:o=>googleTokens.getToken(o)}):null;
let docxBlocked=false, docxBusy=false, pendingShare=null;

const enclosureDefaults=['Certificate / sanction order','FDP / Orientation / Refresher certificate','Conference / seminar certificate','Paper presentation / publication','Research project document','Degree / qualification certificate','Award / honour certificate','Other supporting document'];

function deepAssign(obj,path,value){let p=obj;for(let i=0;i<path.length-1;i++){p=p[path[i]]??={};}p[path[path.length-1]]=value;}
function collectSimple(){
  const data={session:state.session, profile:{}, part1:{}, part2:{}, api:state.api, ui:state.ui, enclosures:state.enclosures, teaching:state.teaching, assignments:state.assignments, results:state.results, activities:state.activities, orientation:state.orientation, research:state.research, otherInfo:state.otherInfo};
  form.querySelectorAll('input[name],textarea[name],select[name]').forEach(el=>{
    const n=el.name; const value=el.type==='number' ? (el.value===''?'':Number(el.value)) : el.value;
    if(['collegeName','collegeDistrict','collegePin','principalName','collegeAddress','collegeOther','title','relation','fullName','fatherHusband','employeeCode','subject','appointmentDate','designation','payBand','basicPay','promotionDate','academicQualification','professionalQualification','researchDegree','dob','serviceStatus','landline','mobile','email','submissionDate','permanentAddress'].includes(n)) data.profile[n]=value;
    else if(n.startsWith('p')) data.part2[n]=value;
    else if(n==='totalPeriodsPerWeek'||n==='researchYesNo'||n.startsWith('research')) data.part2[n]=value;
  });
  return data;
}
function applySimple(raw){
  const {data,notices}=migrateDraft(raw);
  $('session').value=data.session||'';
  const merged={...(data.profile||{}),...(data.part1||{}),...(data.part2||{})};
  const {api:apiData,legacy}=normalizeApi(data.api);
  form.querySelectorAll('input[name],textarea[name],select[name]').forEach(el=>{
    // Every field is set from the record; one it does not have is reset, so nothing carries over from the record shown before.
    if(Object.prototype.hasOwnProperty.call(merged,el.name)) el.value=merged[el.name] ?? '';
    else if(el.tagName==='SELECT') el.selectedIndex=0;
    else el.value='';
  });
  state.session=data.session||''; state.profile=data.profile||{}; state.part1=data.part1||{}; state.part2=data.part2||{}; state.api=apiData; state.teaching=data.teaching||[]; state.assignments=data.assignments||[]; state.results=data.results||[]; state.activities=data.activities; state.orientation=data.orientation; state.research=data.research; state.otherInfo=data.otherInfo; state.enclosures=data.enclosures||[]; state.ui=data.ui||{section:'profile'};
  renderRepeatables(); renderEnclosures(); renderApiLists(); showLegacyNotice(legacy); showPartNotice(notices); updateDobWords(); updateScores(); switchSection(state.ui.section||'profile');
}
function saveLocal(){const data=collectSimple(); data.savedAt=new Date().toISOString(); sessions.writeRecord(store,data); $('lastSaved').value=new Date(data.savedAt).toLocaleString(); updateProgress(); return data;}
function loadLocal(){const notices=sessions.migrate(store); const rec=sessions.loadCurrent(store); if(rec){applySimple(rec); if(rec.savedAt) $('lastSaved').value=new Date(rec.savedAt).toLocaleString();} resolveLastYear(); refreshSessionList(); if(notices.length) $('syncStatus').textContent=notices.join(' ');}
function refreshSessionList(){const dl=$('sessionList'); dl.innerHTML=''; for(const s of sessions.listSessions(store)){const o=document.createElement('option'); o.value=s; dl.appendChild(o);}}
function openSession(session){clearPendingShare(); const rec=sessions.readRecord(store,session)||sessions.newRecordFrom({},session); applySimple(rec); store.setItem(sessions.CURRENT_KEY,session); resolveLastYear(); updateScores(); saveLocal(); refreshSessionList(); renderReview();}
function resolveLastYear(){
  const info=sessions.lastYear(store,state.session);
  const ly=state.api.lastAcademicYear&&typeof state.api.lastAcademicYear==='object'?state.api.lastAcademicYear:{};
  if(info.state==='record') state.api.lastAcademicYear={...info.values,source:'record',from:info.from};
  else if(info.state!=='none'||ly.source==='record') state.api.lastAcademicYear={cat1:'',cat2:'',total12:'',cat3:'',source:info.state==='none'?'typed':'',from:''};
  else state.api.lastAcademicYear=ly;  // no previous record: keep the typed figures (or none yet)
  renderLastYear(info,state.api.lastAcademicYear);
  return info;
}
async function importLastYearFile(file){
  let rec=null; try{rec=JSON.parse(await file.text());}catch(err){console.error(err);}
  if(!rec||typeof rec!=='object'){renderLastYear({state:'none',message:'This is not an ACR file.',problems:[]},state.api.lastAcademicYear||{});return;}
  const res=sessions.checkLastYearFile(rec,state.session);
  if(!res.ok){renderLastYear({state:'none',message:res.message,problems:res.problems||[]},state.api.lastAcademicYear||{});return;}
  sessions.saveRecord(store,rec); resolveLastYear(); updateScores(); saveLocal(); refreshSessionList();
}
async function saveCloud(){ if(!firebaseReady||!currentUser) return; const data=saveLocal(); await setDoc(doc(db,'users',currentUser.uid,'acrs',data.session||'default'),{...data,updatedAt:serverTimestamp()},{merge:true}); $('syncStatus').textContent='Saved locally and synced to Google/Firebase.'; }
async function loadCloud(){ if(!firebaseReady||!currentUser) return; const session=$('session').value.trim(); if(!session) return; const snap=await getDoc(doc(db,'users',currentUser.uid,'acrs',session)); if(snap.exists()){applySimple(snap.data()); $('syncStatus').textContent='Cloud draft loaded.'; }}

function switchSection(id){document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===id));document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.section===id));state.ui.section=id; if(id==='api'){resolveLastYear(); updateScores();} saveLocal(); renderReview();}
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>switchSection(b.dataset.section)));

// Single source of truth for each repeatable collection's container/template
// id. wireRepeatRow previously derived the container id as `collection+'Rows'`,
// which silently mismatched the real 'assignmentRows' element id for the
// 'assignments' collection (it computed 'assignmentsRows') and threw on every
// edit/remove of an assignment row. Centralizing it here fixes that too.
const REPEAT_META={teaching:{containerId:'teachingRows',templateId:'teachingTemplate'},assignments:{containerId:'assignmentRows',templateId:'assignmentTemplate'},results:{containerId:'resultRows',templateId:'resultTemplate'},activities:{containerId:'activityRows',templateId:'activityTemplate'},orientation:{containerId:'orientationRows',templateId:'orientationTemplate'},research:{containerId:'researchRows',templateId:'researchTemplate'},otherInfo:{containerId:'otherInfoRows',templateId:'otherInfoTemplate'}};

function cloneTemplate(id){return document.getElementById(id).content.firstElementChild.cloneNode(true);}
function wireRepeatRow(row,collection){const containerId=REPEAT_META[collection].containerId;row.querySelectorAll('[data-key]').forEach(input=>input.addEventListener('input',()=>{const idx=[...$(containerId).children].indexOf(row);state[collection][idx][input.dataset.key]=input.type==='number'?(input.value===''?'':Number(input.value)):input.value;saveLocal();updateProgress();}));row.querySelector('.remove-row').addEventListener('click',()=>{const idx=[...$(containerId).children].indexOf(row);state[collection].splice(idx,1);renderRepeatables();saveLocal();updateProgress();});}
function populateRow(row,data){row.querySelectorAll('[data-key]').forEach(input=>{const v=data[input.dataset.key];if(v!==undefined)input.value=v;});}
function renderCollection(collection,templateId){const container=$(REPEAT_META[collection].containerId);container.innerHTML='';state[collection].forEach(item=>{const row=cloneTemplate(templateId);populateRow(row,item);wireRepeatRow(row,collection);container.appendChild(row);});}
function renderRepeatables(){Object.entries(REPEAT_META).forEach(([collection,meta])=>renderCollection(collection,meta.templateId));}

// Adding a row now appends just the one new row instead of tearing down and
// rebuilding every row in every repeatable list (the old handler called
// renderRepeatables(), which does container.innerHTML='' + re-clone for ALL
// THREE collections on every click). That full teardown/rebuild destroyed and
// recreated every existing <input>, which dropped keyboard focus and broke the
// browser's scroll anchoring - the actual cause of the page jumping on
// "+ Add ...". Appending only the new row leaves existing rows and scroll
// position untouched, and lets us focus the new row's first field directly.
document.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>{
  const collection=btn.dataset.add;
  const {containerId,templateId}=REPEAT_META[collection];
  state[collection].push({});
  const row=cloneTemplate(templateId);
  wireRepeatRow(row,collection);
  $(containerId).appendChild(row);
  saveLocal();
  updateProgress();
  // Wait a frame so the new row has been laid out before focusing it - focusing
  // scrolls it into view using the browser's minimal "nearest" behavior, which
  // is what keeps the user anchored to the row they just added instead of
  // jumping elsewhere.
  requestAnimationFrame(()=>{
    const firstField=row.querySelector('[data-key]');
    if(firstField) firstField.focus();
  });
}));

function renderEnclosures(){
  const list=$('enclosureList'); list.innerHTML='';
  enclosureDefaults.forEach((label,i)=>{const wrap=document.createElement('label');wrap.className='checkitem';const cb=document.createElement('input');cb.type='checkbox';cb.checked=state.enclosures.some(x=>x.label===label&&x.checked);cb.addEventListener('change',()=>{const found=state.enclosures.find(x=>x.label===label);if(found)found.checked=cb.checked;else state.enclosures.push({label,checked:cb.checked});saveLocal();updateProgress();});wrap.append(cb,document.createTextNode(label));list.appendChild(wrap);});
  $('customEnclosures').innerHTML=''; state.enclosures.filter(x=>x.custom).forEach((x,idx)=>{const d=document.createElement('div');d.className='custom-item';d.innerHTML=`<span>☑ ${escapeHtml(x.label)}</span>`;const b=document.createElement('button');b.type='button';b.className='danger';b.textContent='Remove';b.onclick=()=>{state.enclosures=state.enclosures.filter(y=>y!==x);renderEnclosures();saveLocal();updateProgress();};d.appendChild(b);$('customEnclosures').appendChild(d);});
}
$('addEnclosureBtn').addEventListener('click',()=>{const v=$('customEnclosure').value.trim();if(!v)return;state.enclosures.push({label:v,checked:true,custom:true});$('customEnclosure').value='';renderEnclosures();saveLocal();updateProgress();});

function updateScores(){const result=tally(state.api);renderApiValues(result,lastYearCells(state.api.lastAcademicYear));return result;}
function showLegacyNotice(legacy){
  const el=$('apiLegacyNotice');
  if(!legacy.length){el.classList.add('hidden');el.textContent='';return;}
  el.textContent='This draft was saved by an older version that kept only single API totals. Those values are not used any more; please re-enter them in the tables below: '+legacy.map(([k,v])=>`${k} = ${v}`).join(', ')+'.';
  el.classList.remove('hidden');
}
function apiReviewItems(api){const {values:v,problems}=tally(api);return [['Category I API (point 29)',v.p29.I],['Category II API (point 29)',v.p29.II],['Total I + II',v.p29.I_II],['Category III API (point 29)',v.p29.III],['API problems to fix',problems.length]];}
function showPartNotice(notices){
  const el=$('partLegacyNotice');
  if(!notices.length){el.classList.add('hidden');el.textContent='';return;}
  el.textContent='This draft was saved by an older version. '+notices.join(' — ');
  el.classList.remove('hidden');
}
function updateDobWords(){
  const el=$('dobWords'); const r=parseDob(form.elements.dob.value);
  el.textContent=r.state==='ok'?`In words: ${dobWords(r)}`:(r.state==='bad'?'Not a real date — use DD/MM/YYYY':'');
  el.classList.toggle('over',r.state==='bad');
}
// Everything that stops the Word file from being made (same rules as generateDocx).
function docxProblems(d){return [...fieldProblems(d),...tally(d.api).problems,...lastYearProblems(d.api.lastAcademicYear)];}
function renderFieldProblems(d){
  const ul=$('reviewProblems'); ul.innerHTML='';
  const probs=docxProblems(d);
  if(!lastYearCells(d.api.lastAcademicYear).cat1&&!lastYearProblems(d.api.lastAcademicYear).length){const w=document.createElement('li');w.className='warn';w.textContent='Last academic year figures are not filled in.';ul.appendChild(w);}
  docxBlocked=probs.length>0; syncDocxButtons(); $('docxReason').textContent=probs.length?'Fix the problems listed above first.':'';
  if(!probs.length){const li=document.createElement('li');li.className='ok';li.textContent='No problems. The ACR can be generated.';ul.appendChild(li);return;}
  for(const p of probs){const li=document.createElement('li');li.textContent=p.message;ul.appendChild(li);}
}
form.addEventListener('input',()=>{clearPendingShare();updateScores();updateDobWords();saveLocal();});
form.addEventListener('change',()=>{updateScores();saveLocal();});
$('saveBtn').addEventListener('click',async()=>{try{if(firebaseReady&&currentUser)await saveCloud();else{saveLocal();$('syncStatus').textContent='Draft saved locally.';}}catch(err){console.error(err);$('syncStatus').textContent='Saved locally; cloud sync failed, so no work was lost.';}});
$('exportBtn').addEventListener('click',()=>{const data=saveLocal();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ACR_${data.session||'draft'}.acr.json`;a.click();URL.revokeObjectURL(a.href);});
$('importInput').addEventListener('change',async e=>{
  const file=e.target.files[0]; e.target.value=''; if(!file) return;
  let rec=null; try{rec=JSON.parse(await file.text());}catch(err){console.error(err);}
  if(!rec||typeof rec!=='object'){alert('Invalid ACR draft file.');return;}
  const s=sessions.isSession(rec.session)?rec.session:'';
  const exists=s?sessions.hasRecord(store,s):store.getItem(sessions.DRAFT_KEY)!==null;
  if(exists&&!confirm(s?`Replace the saved ${s} record with this file?`:'Replace the unnamed draft with this file?')) return;
  saveLocal(); rec.session=s; sessions.saveRecord(store,rec);
  if(s) openSession(s); else {applySimple(rec); store.setItem(sessions.CURRENT_KEY,''); resolveLastYear(); updateScores(); saveLocal(); refreshSessionList();}
  $('syncStatus').textContent=s?`Imported the ${s} record.`:'Imported as the unnamed draft.';
});
$('session').addEventListener('change',()=>{
  const box=$('session'), status=$('syncStatus'), target=box.value.trim();
  const action=sessions.decideSwitch(state.session,target,sessions.hasRecord(store,target));
  if(action==='same'){box.value=state.session;return;}
  if(action==='invalid'){status.textContent='Session must look like 2025-26.';box.value=state.session;return;}
  if(action==='name-draft'){state.session=target; resolveLastYear(); updateScores(); saveLocal(); store.removeItem(sessions.DRAFT_KEY); refreshSessionList(); status.textContent=`This draft is now the ${target} record.`;return;}
  if(action==='ask-open-existing'&&!confirm(`A ${target} record already exists. Open it? (your unnamed draft is kept as the unnamed draft)`)){box.value=state.session;return;}
  saveLocal();
  if(action==='new'){sessions.saveRecord(store,sessions.newRecordFrom(collectSimple(),target)); status.textContent=`Started the ${target} record (profile copied; annual parts empty).`;}
  else status.textContent=`Opened the ${target} record.`;
  openSession(target);
});
function syncDocxButtons(){for(const id of ['downloadDocxBtn','shareBtn','driveBtn','shareNowBtn'])$(id).disabled=docxBlocked||docxBusy;}
async function makeDocx(d){
  const resp=await fetch('ACR_EMPLOYEE_MASTER.docx');
  if(!resp.ok) throw new Error('The Word template could not be loaded.');
  const bytes=new Uint8Array(await resp.arrayBuffer());
  const out=await generateDocx(d,bytes,{JSZip:window.JSZip,DOMParser,XMLSerializer});
  return new File([out],acrFileName(d,'docx'),{type:DOCX_MIME});
}
const errText=err=>err instanceof ProblemsError?'Fix the problems listed above first.':(err?.message||String(err));
// Runs one job at a time; job(say) returns the final status text, or a DOM node for it.
async function runDocxJob(job){
  if(docxBusy) return;
  const status=$('docxStatus'); docxBusy=true; syncDocxButtons(); clearPendingShare();
  try{const out=await job(t=>{status.textContent=t;}); status.replaceChildren(out);}
  catch(err){console.error(err); status.textContent=errText(err);}
  finally{docxBusy=false; syncDocxButtons();}
}
function clearPendingShare(){pendingShare=null; $('shareNowBtn').classList.add('hidden');}
function offerShareTap(files,label){pendingShare=files; $('shareNowBtn').textContent=label; $('shareNowBtn').classList.remove('hidden');}
// retry:false is for a result that follows a fresh tap on "Open share menu": offering the button again could loop forever.
function shareResultText(result,files,{retry=true}={}){
  if(result==='shared') return 'Share menu opened; the files went to the app you chose.';
  if(result==='partial') return "The PDF went to the share menu. This browser can't share Word files, so the Word file was downloaded; attach it to the email yourself.";
  if(result==='cancelled') return 'Sharing was cancelled.';
  if(result==='needs-tap'&&retry){offerShareTap(files,'Open share menu'); return 'The files are ready. Tap "Open share menu".';}
  if(result==='needs-tap'){files.forEach(f=>downloadFile(f)); return files.length>1?'This browser would not share the files, so they were downloaded. Attach them to an email yourself.':'This browser would not share the file, so it was downloaded. Attach it to an email yourself.';}
  return files.length>1?"This browser can't attach files to a share; both files were downloaded. Attach them to an email yourself.":"This browser can't attach files to a share; the file was downloaded. Attach it to an email yourself.";
}
async function pdfFor(d,docx){return new File([await drive.docxToPdf(docx)],acrFileName(d,'pdf'),{type:'application/pdf'});}

$('downloadDocxBtn').addEventListener('click',()=>runDocxJob(async say=>{
  const d=saveLocal(); say('Making the Word file…');
  const docx=await makeDocx(d); downloadFile(docx);
  return `Word file ready: ${docx.name}`;
}));

$('shareBtn').addEventListener('click',()=>runDocxJob(async say=>{
  const d=saveLocal(); let signInError=null;
  say('Signing in to Google…');
  try{await googleTokens.getToken();}catch(err){signInError=err;} // first, while the tap still allows a pop-up
  say('Making the Word file…');
  const docx=await makeDocx(d);
  let pdf=null;
  if(!signInError){try{say('Making the PDF…'); pdf=await pdfFor(d,docx);}catch(err){signInError=err;}}
  if(!pdf){console.error(signInError); offerShareTap([docx],'Share the Word file only'); return `The PDF could not be made: ${errText(signInError)} You can share the Word file only.`;}
  const files=[docx,pdf];
  return shareResultText(await shareFiles(files,{title:docx.name.replace(/\.docx$/,'')}),files);
}));

$('shareNowBtn').addEventListener('click',()=>{const files=pendingShare; if(!files) return; runDocxJob(async()=>shareResultText(await shareFiles(files,{title:files[0].name.replace(/\.docx$/,'')}),files,{retry:false}));});

$('driveBtn').addEventListener('click',()=>runDocxJob(async say=>{
  const d=saveLocal();
  say('Signing in to Google…'); await googleTokens.getToken();
  say('Making the Word file…'); const docx=await makeDocx(d);
  say('Making the PDF…'); const pdf=await pdfFor(d,docx);
  say('Uploading…'); const folderId=await drive.ensureFolder();
  await drive.upsertFile({name:docx.name,bytes:docx,mime:DOCX_MIME,folderId});
  await drive.upsertFile({name:pdf.name,bytes:pdf,mime:'application/pdf',folderId});
  const p=document.createElement('span'); p.append(`Saved ${docx.name} and ${pdf.name} to Google Drive. `);
  const a=document.createElement('a'); a.href=`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`; a.target='_blank'; a.rel='noopener'; a.textContent=`Open the "${FOLDER_NAME}" folder`;
  p.append(a); return p;
}));

// Preview: the same Word file as Download, drawn as HTML pages by docx-preview (vendor/), from any tab.
// Headers/footers are left out: docx-preview can't work out page numbers.
async function openPreview(){
  const panel=$('previewPanel'), pages=$('previewPages'), status=$('previewStatus');
  pages.replaceChildren(); $('previewProblems').classList.add('hidden'); panel.classList.remove('hidden'); document.body.style.overflow='hidden';
  const d=saveLocal(), probs=docxProblems(d);
  if(probs.length){
    status.textContent='';
    $('previewProblemList').replaceChildren(...probs.map(p=>{const li=document.createElement('li');li.textContent=p.message;return li;}));
    $('previewProblems').classList.remove('hidden'); return;
  }
  status.textContent='Making the preview…';
  try{const docx=await makeDocx(d); await window.docx.renderAsync(docx,pages,null,{inWrapper:true,breakPages:true,ignoreLastRenderedPageBreak:true,renderHeaders:false,renderFooters:false}); status.textContent='';}
  catch(err){console.error(err); status.textContent=`The preview could not be shown: ${errText(err)}`;}
}
function closePreview(){$('previewPanel').classList.add('hidden'); $('previewPages').replaceChildren(); document.body.style.overflow='';}
$('previewBtn').addEventListener('click',openPreview);
$('previewClose').addEventListener('click',closePreview);
$('previewToReview').addEventListener('click',()=>{closePreview(); document.querySelector('.tabs button[data-section="review"]').click();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('previewPanel').classList.contains('hidden'))closePreview();});

if(googleReady){for(const id of ['shareBtn','driveBtn','googleRouteHelp'])$(id).classList.remove('hidden'); googleTokens.preload();}

function updateProgress(){const d=collectSimple();let done=0,total=0;const must=[['fullName','Profile'],['employeeCode','Profile'],['subject','Profile'],['designation','Profile'],['p17','17'],['p18','18'],['p19b','19b'],['p21i','21i'],['p25','25']];must.forEach(([k])=>{total++; const v=d.profile[k]??d.part2[k]; if(String(v||'').trim())done++;}); total+=4; if(d.teaching.length)done++; if(d.assignments.length)done++; if(d.results.length)done++; if(d.enclosures.some(x=>x.checked))done++; const pct=Math.round(done/total*100);$('progressBar').style.width=`${pct}%`;$('progressText').textContent=`${pct}%`;}
function renderReview(){const d=collectSimple();renderFieldProblems(d);const items=[['Session',d.session||'Not set'],['Employee',d.profile.fullName||'Not set'],['Employee Code',d.profile.employeeCode||'Not set'],['Teaching rows',d.teaching.length],['Exam result rows',d.results.length],['Selected enclosures',d.enclosures.filter(x=>x.checked).length],...apiReviewItems(d.api)];const box=$('reviewList');box.innerHTML='';items.forEach(([a,b])=>{const x=document.createElement('div');x.className='review-item';x.innerHTML=`<span>${escapeHtml(String(a))}</span><strong>${escapeHtml(String(b))}</strong>`;box.appendChild(x);});}
function escapeHtml(s){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

if(firebaseReady){$('signInBtn').addEventListener('click',async()=>{const provider=new GoogleAuthProvider();await signInWithPopup(auth,provider);});$('signOutBtn').addEventListener('click',()=>signOut(auth));onAuthStateChanged(auth,async user=>{currentUser=user;if(user){$('userLine').textContent=user.email||'Signed in';if(SHOW_FIREBASE_SIGNIN){$('signInBtn').classList.add('hidden');$('signOutBtn').classList.remove('hidden');}try{await loadCloud();}catch(err){console.warn(err);$('syncStatus').textContent='Signed in; local draft is available even if cloud sync is unavailable.';}}else{$('userLine').textContent='Local draft mode';if(SHOW_FIREBASE_SIGNIN){$('signInBtn').classList.remove('hidden');$('signOutBtn').classList.add('hidden');}}});}else{$('signInBtn').disabled=true;$('signInBtn').title='Configure firebase-config.js first';}

if('serviceWorker' in navigator){
  // A new version takes over as soon as it is downloaded (sw.js skipWaiting); reload once so the page runs it.
  // Not on a first visit (no previous version), and the form is saved on every change, so nothing is lost.
  const hadController=Boolean(navigator.serviceWorker.controller); let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadController||reloaded)return;reloaded=true;location.reload();});
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
initApiUi({getApi:()=>state.api,onChange:()=>{updateScores();saveLocal();}});
initLastYearUi({getLy:()=>state.api.lastAcademicYear||{},setLy:v=>{state.api.lastAcademicYear=v;},onChange:()=>{resolveLastYear();updateScores();saveLocal();},onImport:importLastYearFile});
renderApiLists();loadLocal();renderRepeatables();renderEnclosures();updateScores();updateProgress();renderReview();
