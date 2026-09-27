import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import firebaseConfig from './firebase-config.js';

const LOCAL_KEY='acrUtilityDraftV01';
const state={session:'', profile:{}, part1:{}, part2:{}, teaching:[], assignments:[], results:[], api:{}, enclosures:[], ui:{section:'profile'}};
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
  const data={session:$('session').value.trim(), profile:{}, part1:{}, part2:{}, api:{}, ui:state.ui, enclosures:state.enclosures, teaching:state.teaching, assignments:state.assignments, results:state.results};
  form.querySelectorAll('input[name],textarea[name],select[name]').forEach(el=>{
    const n=el.name; const value=el.type==='number' ? (el.value===''?'':Number(el.value)) : el.value;
    if(['collegeName','collegeDistrict','collegePin','principalName','collegeAddress','collegeOther','fullName','fatherHusband','employeeCode','subject','appointmentDate','designation','payBand','basicPay','promotionDate','academicQualification','professionalQualification','researchDegree','dob','serviceStatus','mobile','email','permanentAddress'].includes(n)) data.profile[n]=value;
    else if(n.startsWith('p')) data.part2[n]=value;
    else if(n.startsWith('api')) data.api[n]=value;
    else if(n==='totalPeriodsPerWeek'||n==='researchYesNo'||n.startsWith('research')) data.part2[n]=value;
  });
  return data;
}
function applySimple(data){
  $('session').value=data.session||'';
  const merged={...(data.profile||{}),...(data.part1||{}),...(data.part2||{}),...(data.api||{})};
  form.querySelectorAll('input[name],textarea[name],select[name]').forEach(el=>{ if(Object.prototype.hasOwnProperty.call(merged,el.name)) el.value=merged[el.name] ?? ''; });
  state.session=data.session||''; state.profile=data.profile||{}; state.part1=data.part1||{}; state.part2=data.part2||{}; state.api=data.api||{}; state.teaching=data.teaching||[]; state.assignments=data.assignments||[]; state.results=data.results||[]; state.enclosures=data.enclosures||[]; state.ui=data.ui||{section:'profile'};
  renderRepeatables(); renderEnclosures(); updateScores(); switchSection(state.ui.section||'profile');
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
const REPEAT_META={teaching:{containerId:'teachingRows',templateId:'teachingTemplate'},assignments:{containerId:'assignmentRows',templateId:'assignmentTemplate'},results:{containerId:'resultRows',templateId:'resultTemplate'}};

function cloneTemplate(id){return document.getElementById(id).content.firstElementChild.cloneNode(true);}
function wireRepeatRow(row,collection){const containerId=REPEAT_META[collection].containerId;row.querySelectorAll('[data-key]').forEach(input=>input.addEventListener('input',()=>{const idx=[...$(containerId).children].indexOf(row);state[collection][idx][input.dataset.key]=input.type==='number'?(input.value===''?'':Number(input.value)):input.value;saveLocal();updateProgress();}));row.querySelector('.remove-row').addEventListener('click',()=>{const idx=[...$(containerId).children].indexOf(row);state[collection].splice(idx,1);renderRepeatables();saveLocal();updateProgress();});}
function populateRow(row,data){row.querySelectorAll('[data-key]').forEach(input=>{const v=data[input.dataset.key];if(v!==undefined)input.value=v;});}
function renderCollection(collection,templateId){const container=$(REPEAT_META[collection].containerId);container.innerHTML='';state[collection].forEach(item=>{const row=cloneTemplate(templateId);populateRow(row,item);wireRepeatRow(row,collection);container.appendChild(row);});}
function renderRepeatables(){renderCollection('teaching','teachingTemplate');renderCollection('assignments','assignmentTemplate');renderCollection('results','resultTemplate');}

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

function updateScores(){
  const nums=['apiC1Classes','apiC1Excess','apiC1Resources','apiC1Innovative','apiC1Exam','apiC2Extension','apiC2Management','apiC2Professional','apiC3'];
  nums.forEach(n=>{const el=form.elements[n];if(el) state.api[n]=el.value===''?'':Number(el.value);});
  const c1=(+state.api.apiC1Classes||0)+(+state.api.apiC1Excess||0)+(+state.api.apiC1Resources||0)+(+state.api.apiC1Innovative||0)+(+state.api.apiC1Exam||0);
  const raw2=(+state.api.apiC2Extension||0)+(+state.api.apiC2Management||0)+(+state.api.apiC2Professional||0);
  const c2=Math.min(raw2,25);
  $('cat1Total').textContent=`${c1.toFixed(2)} / 125`; $('cat2Raw').textContent=`${raw2.toFixed(2)} / 50`; $('cat2Total').textContent=`${c2.toFixed(2)} / 25`;
  $('summary1').textContent=c1.toFixed(2); $('summary2').textContent=c2.toFixed(2); $('summary12').textContent=(c1+c2).toFixed(2); $('summary3').textContent=(+state.api.apiC3||0).toFixed(2);
}
form.addEventListener('input',()=>{updateScores();saveLocal();});
form.addEventListener('change',()=>{updateScores();saveLocal();});
$('saveBtn').addEventListener('click',async()=>{try{if(firebaseReady&&currentUser)await saveCloud();else{saveLocal();$('syncStatus').textContent='Draft saved locally.';}}catch(err){console.error(err);$('syncStatus').textContent='Saved locally; cloud sync failed, so no work was lost.';}});
$('exportBtn').addEventListener('click',()=>{const data=saveLocal();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ACR_${data.session||'draft'}.acr.json`;a.click();URL.revokeObjectURL(a.href);});
$('importInput').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());applySimple(data);saveLocal();}catch(err){alert('Invalid ACR draft file.');console.error(err);}});

function updateProgress(){const d=collectSimple();let done=0,total=0;const must=[['fullName','Profile'],['employeeCode','Profile'],['subject','Profile'],['designation','Profile'],['p17','17'],['p18','18'],['p19b','19b'],['p21i','21i'],['p25','25']];must.forEach(([k])=>{total++; const v=d.profile[k]??d.part2[k]; if(String(v||'').trim())done++;}); total+=4; if(d.teaching.length)done++; if(d.assignments.length)done++; if(d.results.length)done++; if(d.enclosures.some(x=>x.checked))done++; const pct=Math.round(done/total*100);$('progressBar').style.width=`${pct}%`;$('progressText').textContent=`${pct}%`;}
function renderReview(){const d=collectSimple();const items=[['Session',d.session||'Not set'],['Employee',d.profile.fullName||'Not set'],['Employee Code',d.profile.employeeCode||'Not set'],['Teaching rows',d.teaching.length],['Exam result rows',d.results.length],['Selected enclosures',d.enclosures.filter(x=>x.checked).length],['Category I API',(+d.api.apiC1Classes||0)+(+d.api.apiC1Excess||0)+(+d.api.apiC1Resources||0)+(+d.api.apiC1Innovative||0)+(+d.api.apiC1Exam||0)],['Category II API',Math.min((+d.api.apiC2Extension||0)+(+d.api.apiC2Management||0)+(+d.api.apiC2Professional||0),25)],['Category III API',+d.api.apiC3||0]];const box=$('reviewList');box.innerHTML='';items.forEach(([a,b])=>{const x=document.createElement('div');x.className='review-item';x.innerHTML=`<span>${escapeHtml(String(a))}</span><strong>${escapeHtml(String(b))}</strong>`;box.appendChild(x);});}
function escapeHtml(s){return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

if(firebaseReady){$('signInBtn').addEventListener('click',async()=>{const provider=new GoogleAuthProvider();await signInWithPopup(auth,provider);});$('signOutBtn').addEventListener('click',()=>signOut(auth));onAuthStateChanged(auth,async user=>{currentUser=user;if(user){$('userLine').textContent=user.email||'Signed in';$('signInBtn').classList.add('hidden');$('signOutBtn').classList.remove('hidden');try{await loadCloud();}catch(err){console.warn(err);$('syncStatus').textContent='Signed in; local draft is available even if cloud sync is unavailable.';}}else{$('userLine').textContent='Local draft mode';$('signInBtn').classList.remove('hidden');$('signOutBtn').classList.add('hidden');}});}else{$('signInBtn').disabled=true;$('signInBtn').title='Configure firebase-config.js first';}

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
loadLocal();renderRepeatables();renderEnclosures();updateScores();updateProgress();renderReview();
