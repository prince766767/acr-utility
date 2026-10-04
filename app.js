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
function openSession(session){const rec=sessions.readRecord(store,session)||sessions.newRecordFrom({},session); applySimple(rec); store.setItem(sessions.CURRENT_KEY,session); resolveLastYear(); updateScores(); saveLocal(); refreshSessionList(); renderReview();}
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
function renderFieldProblems(d){
  const ul=$('reviewProblems'); ul.innerHTML='';
  const probs=[...fieldProblems(d),...tally(d.api).problems,...lastYearProblems(d.api.lastAcademicYear)];
  if(!lastYearCells(d.api.lastAcademicYear).cat1&&!lastYearProblems(d.api.lastAcademicYear).length){const w=document.createElement('li');w.className='warn';w.textContent='Last academic year figures are not filled in.';ul.appendChild(w);}
  $('downloadDocxBtn').disabled=probs.length>0; $('docxReason').textContent=probs.length?'Fix the problems listed above first.':'';
  if(!probs.length){const li=document.createElement('li');li.className='ok';li.textContent='No problems. The ACR can be generated.';ul.appendChild(li);return;}
  for(const p of probs){const li=document.createElement('li');li.textContent=p.message;ul.appendChild(li);}
}
form.addEventListener('input',()=>{updateScores();updateDobWords();saveLocal();});
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
$('downloadDocxBtn').addEventListener('click',async()=>{
  const status=$('docxStatus'), d=saveLocal();
  status.textContent='Making the Word file…';
  try{
    const resp=await fetch('ACR_EMPLOYEE_MASTER.docx');
    if(!resp.ok) throw new Error('The Word template could not be loaded.');
    const bytes=new Uint8Array(await resp.arrayBuffer());
    const out=await generateDocx(d,bytes,{JSZip:window.JSZip,DOMParser,XMLSerializer});
    const name=acrFileName(d,'docx');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([out],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    status.textContent=`Word file ready: ${name}`;
  }catch(err){console.error(err); status.textContent=err instanceof ProblemsError?'Fix the problems listed above first.':(err.message||String(err));}
});

function updateProgress(){const d=collectSimple();let done=0,total=0;const must=[['fullName','Profile'],['employeeCode','Profile'],['subject','Profile'],['designation','Profile'],['p17','17'],['p18','18'],['p19b','19b'],['p21i','21i'],['p25','25']];must.forEach(([k])=>{total++; const v=d.profile[k]??d.part2[k]; if(String(v||'').trim())done++;}); total+=4; if(d.teaching.length)done++; if(d.assignments.length)done++; if(d.results.length)done++; if(d.enclosures.some(x=>x.checked))done++; const pct=Math.round(done/total*100);$('progressBar').style.width=`${pct}%`;$('progressText').textContent=`${pct}%`;}
function renderReview(){const d=collectSimple();renderFieldProblems(d);const items=[['Session',d.session||'Not set'],['Employee',d.profile.fullName||'Not set'],['Employee Code',d.profile.employeeCode||'Not set'],['Teaching rows',d.teaching.length],['Exam result rows',d.results.length],['Selected enclosures',d.enclosures.filter(x=>x.checked).length],...apiReviewItems(d.api)];const box=$('reviewList');box.innerHTML='';items.forEach(([a,b])=>{const x=document.createElement('div');x.className='review-item';x.innerHTML=`<span>${escapeHtml(String(a))}</span><strong>${escapeHtml(String(b))}</strong>`;box.appendChild(x);});}
function escapeHtml(s){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

if(firebaseReady){$('signInBtn').addEventListener('click',async()=>{const provider=new GoogleAuthProvider();await signInWithPopup(auth,provider);});$('signOutBtn').addEventListener('click',()=>signOut(auth));onAuthStateChanged(auth,async user=>{currentUser=user;if(user){$('userLine').textContent=user.email||'Signed in';$('signInBtn').classList.add('hidden');$('signOutBtn').classList.remove('hidden');try{await loadCloud();}catch(err){console.warn(err);$('syncStatus').textContent='Signed in; local draft is available even if cloud sync is unavailable.';}}else{$('userLine').textContent='Local draft mode';$('signInBtn').classList.remove('hidden');$('signOutBtn').classList.add('hidden');}});}else{$('signInBtn').disabled=true;$('signInBtn').title='Configure firebase-config.js first';}

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
initApiUi({getApi:()=>state.api,onChange:()=>{updateScores();saveLocal();}});
initLastYearUi({getLy:()=>state.api.lastAcademicYear||{},setLy:v=>{state.api.lastAcademicYear=v;},onChange:()=>{resolveLastYear();updateScores();saveLocal();},onImport:importLastYearFile});
renderApiLists();loadLocal();renderRepeatables();renderEnclosures();updateScores();updateProgress();renderReview();
