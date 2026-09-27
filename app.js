import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import firebaseConfig from './firebase-config.js';
import { tally, normalizeApi, emptyApi } from './api_tally.js';
import { initApiUi, renderApiLists, renderApiValues } from './api_ui.js';
import { parseDob, dobWords, fieldProblems, migrateDraft } from './acr_fields.js';

const LOCAL_KEY='acrUtilityDraftV01';
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
  const data={session:$('session').value.trim(), profile:{}, part1:{}, part2:{}, api:state.api, ui:state.ui, enclosures:state.enclosures, teaching:state.teaching, assignments:state.assignments, results:state.results, activities:state.activities, orientation:state.orientation, research:state.research, otherInfo:state.otherInfo};
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
  form.querySelectorAll('input[name],textarea[name],select[name]').forEach(el=>{ if(Object.prototype.hasOwnProperty.call(merged,el.name)) el.value=merged[el.name] ?? ''; });
  state.session=data.session||''; state.profile=data.profile||{}; state.part1=data.part1||{}; state.part2=data.part2||{}; state.api=apiData; state.teaching=data.teaching||[]; state.assignments=data.assignments||[]; state.results=data.results||[]; state.activities=data.activities; state.orientation=data.orientation; state.research=data.research; state.otherInfo=data.otherInfo; state.enclosures=data.enclosures||[]; state.ui=data.ui||{section:'profile'};
  renderRepeatables(); renderEnclosures(); renderApiLists(); showLegacyNotice(legacy); showPartNotice(notices); updateDobWords(); updateScores(); switchSection(state.ui.section||'profile');
}
function saveLocal(){const data=collectSimple(); data.savedAt=new Date().toISOString(); localStorage.setItem(LOCAL_KEY,JSON.stringify(data)); $('lastSaved').value=new Date(data.savedAt).toLocaleString(); updateProgress(); return data;}
function loadLocal(){const raw=localStorage.getItem(LOCAL_KEY); if(!raw) return; try{const data=JSON.parse(raw); applySimple(data); if(data.savedAt) $('lastSaved').value=new Date(data.savedAt).toLocaleString();}catch(err){console.error(err)}}
async function saveCloud(){ if(!firebaseReady||!currentUser) return; const data=saveLocal(); await setDoc(doc(db,'users',currentUser.uid,'acrs',data.session||'default'),{...data,updatedAt:serverTimestamp()},{merge:true}); $('syncStatus').textContent='Saved locally and synced to Google/Firebase.'; }
async function loadCloud(){ if(!firebaseReady||!currentUser) return; const session=$('session').value.trim(); if(!session) return; const snap=await getDoc(doc(db,'users',currentUser.uid,'acrs',session)); if(snap.exists()){applySimple(snap.data()); $('syncStatus').textContent='Cloud draft loaded.'; }}

function switchSection(id){document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active',s.id===id));document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.section===id));state.ui.section=id; saveLocal(); renderReview();}
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

function updateScores(){const result=tally(state.api);renderApiValues(result);return result;}
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
  const probs=[...fieldProblems(d),...tally(d.api).problems];
  if(!probs.length){const li=document.createElement('li');li.className='ok';li.textContent='No problems. The ACR can be generated.';ul.appendChild(li);return;}
  for(const p of probs){const li=document.createElement('li');li.textContent=p.message;ul.appendChild(li);}
}
form.addEventListener('input',()=>{updateScores();updateDobWords();saveLocal();});
form.addEventListener('change',()=>{updateScores();saveLocal();});
$('saveBtn').addEventListener('click',async()=>{try{if(firebaseReady&&currentUser)await saveCloud();else{saveLocal();$('syncStatus').textContent='Draft saved locally.';}}catch(err){console.error(err);$('syncStatus').textContent='Saved locally; cloud sync failed, so no work was lost.';}});
$('exportBtn').addEventListener('click',()=>{const data=saveLocal();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ACR_${data.session||'draft'}.acr.json`;a.click();URL.revokeObjectURL(a.href);});
$('importInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());applySimple(data);saveLocal();}catch(err){alert('Invalid ACR draft file.');console.error(err);}});

function updateProgress(){const d=collectSimple();let done=0,total=0;const must=[['fullName','Profile'],['employeeCode','Profile'],['subject','Profile'],['designation','Profile'],['p17','17'],['p18','18'],['p19b','19b'],['p21i','21i'],['p25','25']];must.forEach(([k])=>{total++; const v=d.profile[k]??d.part2[k]; if(String(v||'').trim())done++;}); total+=4; if(d.teaching.length)done++; if(d.assignments.length)done++; if(d.results.length)done++; if(d.enclosures.some(x=>x.checked))done++; const pct=Math.round(done/total*100);$('progressBar').style.width=`${pct}%`;$('progressText').textContent=`${pct}%`;}
function renderReview(){const d=collectSimple();renderFieldProblems(d);const items=[['Session',d.session||'Not set'],['Employee',d.profile.fullName||'Not set'],['Employee Code',d.profile.employeeCode||'Not set'],['Teaching rows',d.teaching.length],['Exam result rows',d.results.length],['Selected enclosures',d.enclosures.filter(x=>x.checked).length],...apiReviewItems(d.api)];const box=$('reviewList');box.innerHTML='';items.forEach(([a,b])=>{const x=document.createElement('div');x.className='review-item';x.innerHTML=`<span>${escapeHtml(String(a))}</span><strong>${escapeHtml(String(b))}</strong>`;box.appendChild(x);});}
function escapeHtml(s){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

if(firebaseReady){$('signInBtn').addEventListener('click',async()=>{const provider=new GoogleAuthProvider();await signInWithPopup(auth,provider);});$('signOutBtn').addEventListener('click',()=>signOut(auth));onAuthStateChanged(auth,async user=>{currentUser=user;if(user){$('userLine').textContent=user.email||'Signed in';$('signInBtn').classList.add('hidden');$('signOutBtn').classList.remove('hidden');try{await loadCloud();}catch(err){console.warn(err);$('syncStatus').textContent='Signed in; local draft is available even if cloud sync is unavailable.';}}else{$('userLine').textContent='Local draft mode';$('signInBtn').classList.remove('hidden');$('signOutBtn').classList.add('hidden');}});}else{$('signInBtn').disabled=true;$('signInBtn').title='Configure firebase-config.js first';}

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
initApiUi({getApi:()=>state.api,onChange:()=>{updateScores();saveLocal();}});
renderApiLists();loadLocal();renderRepeatables();renderEnclosures();updateScores();updateProgress();renderReview();
