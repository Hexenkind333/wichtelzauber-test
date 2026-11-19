/* Wichtelzauber family synchronization, Firebase Auth + Firestore. No credentials embedded. */
(()=>{'use strict';
// Vorherige Test-Synchronisierungsschlüssel einmalig übernehmen, ohne die alten Schlüssel zu löschen.
const LEGACY={CONF:'wichtel_firebase_config_v1',FAMILY:'wichtel_family_id_v1',PENDING:'wichtel_cloud_pending_v1',REV:'wichtel_cloud_revision_v1',BASE:'wichtel_cloud_baseline_v1'};
const CONF='wichtel_test_firebase_config_v1',FAMILY='wichtel_test_family_id_v1',PENDING='wichtel_test_cloud_pending_v1',REV='wichtel_test_cloud_revision_v1',BASE='wichtel_test_cloud_baseline_v1';
if(!localStorage.getItem(FAMILY)&&localStorage.getItem(LEGACY.FAMILY)){
  for(const [name,oldKey] of Object.entries(LEGACY)){
    const newKey={CONF,FAMILY,PENDING,REV,BASE}[name];
    if(localStorage.getItem(newKey)===null&&localStorage.getItem(oldKey)!==null)localStorage.setItem(newKey,localStorage.getItem(oldKey));
  }
}
let fb=null,auth=null,db=null,user=null,familyId=localStorage.getItem(FAMILY)||'',unsubscribe=null,rev=Number(localStorage.getItem(REV)||0),busy=false,dirty=localStorage.getItem(PENDING)==='1',timer=null,conflict=false,initializing=false,notice='',readSequence=0;
const $=id=>document.getElementById(id),html=s=>esc(s),setNotice=t=>{notice=t;paint()};
// No production Firebase credentials in the test build. Configure a dedicated test project.
const TEST_CONFIG=Object.freeze({apiKey:"AIzaSyDKpaSOIDQN58mybqnC2_OBJVgh-2lwGqc",authDomain:"testumgebung-wichtelzauber.firebaseapp.com",projectId:"testumgebung-wichtelzauber",storageBucket:"testumgebung-wichtelzauber.firebasestorage.app",messagingSenderId:"420137284825",appId:"1:420137284825:web:8cb3ae24c744cd13b47ac8"});
const config=()=>TEST_CONFIG;
function loadScript(src){return new Promise((resolve,reject)=>{let s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(Error('Firebase-Bibliothek konnte nicht geladen werden. Internetverbindung prüfen.'));document.head.appendChild(s)})}
async function init(){if(initializing||fb)return;let c=config();if(!c)return paint();if(c.projectId!=='testumgebung-wichtelzauber'){setNotice('Sicherheitssperre: Produktivprojekt in Testversion nicht erlaubt.');return}initializing=true;try{
 await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
 await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js');
 await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js');
 fb=firebase.initializeApp(c);auth=firebase.auth();db=firebase.firestore();
 auth.onAuthStateChanged(async u=>{user=u;if(unsubscribe){unsubscribe();unsubscribe=null}if(user&&familyId)await attach();paint()});
 }catch(e){notice='Firebase konnte nicht gestartet werden: '+e.message;paint()}finally{initializing=false}}
function paint(){let root=$('cloudPanel');if(!root)return;let c=config();let uid=user?.uid||'';
 let msg=notice?`<div class="cloud-message" role="status">${html(notice)}</div>`:'';
 if(!c){root.innerHTML=`<h3>☁️ Familien-Synchronisierung</h3><p>Einmalige Einrichtung: Firebase-Projekt anlegen und die Web-App-Konfiguration eintragen. Das Design und alle bisherigen Bereiche bleiben erhalten.</p>${msg}<form onsubmit="WichtelSync.configure(event)"><label>Firebase-Konfiguration (JSON aus Projekteinstellungen → Web-App)</label><textarea name="config" rows="7" required placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'></textarea><button class="primary">Firebase verbinden</button></form><p class="muted">Noch keine Cloud aktiv. Deine bisherigen Daten bleiben lokal.</p>`;return}
 let userArea=user?`<p>Angemeldet als <b>${html(user.email)}</b><br><small>Deine Benutzer-ID (UID) zum Teilen: <code>${html(uid)}</code></small></p><button onclick="WichtelSync.signOut()">Abmelden</button>`:`<div class="cloud-grid"><form onsubmit="WichtelSync.signIn(event)"><b>Anmelden</b><input name="email" type="email" placeholder="E-Mail" autocomplete="email" required><input name="password" type="password" placeholder="Passwort" autocomplete="current-password" required><button class="primary">Anmelden</button></form><form onsubmit="WichtelSync.register(event)"><b>Neues Konto</b><input name="email" type="email" placeholder="E-Mail" autocomplete="email" required><input name="password" type="password" placeholder="Passwort (mind. 6 Zeichen)" minlength="6" autocomplete="new-password" required><button>Konto erstellen</button></form></div>`;
 let fam=user?(familyId?`<p>Familie: <code>${html(familyId)}</code> · <b>${conflict?'⚠️ Konflikt':dirty?'⏳ Noch nicht synchronisiert':busy?'⏳ Synchronisiere':'✓ Cloud verbunden (Datenstand prüfen)'}</b></p><button onclick="WichtelSync.leave()">Familie auf diesem Gerät trennen</button><div class="cloud-grid"><form onsubmit="WichtelSync.addMember(event)"><label>Partner hinzufügen (nur Familiengründer)</label><input name="uid" placeholder="UID deines Partners" required><button>Partner freischalten</button></form></div><button onclick="WichtelSync.uploadLocal()">📤 Lokale Planung bewusst in Cloud übernehmen</button>${conflict?`<p class="cloud-danger">Die Cloud wurde auf einem anderen Gerät geändert. Nichts wird automatisch überschrieben.</p><button onclick="WichtelSync.takeCloud()">Cloud-Version laden</button><button onclick="WichtelSync.overwriteCloud()">Meine lokale Version bewusst übernehmen</button>`:''}`:`<div class="cloud-grid"><div><b>Neue Familie erstellen</b><p>Deine aktuellen lokalen Daten werden als erster gemeinsamer Stand gespeichert.</p><button onclick="WichtelSync.createFamily()">Familie erstellen</button></div><form onsubmit="WichtelSync.join(event)"><b>Bestehender Familie beitreten</b><input name="family" placeholder="Familien-ID vom anderen Gerät" required><button>Familie verbinden</button></form></div>`):'';
 root.innerHTML=`<h3>☁️ Familien-Synchronisierung</h3><p>Gleicher gemeinsamer Kalender auf PC und Handy. Jede Person hat ein eigenes Konto.</p>${msg}${userArea}${fam}<p class="muted">⚠️ Änderungen werden bei Internetverbindung übertragen. Bei gleichzeitigen Bearbeitungen gibt es eine Konfliktwarnung. Größere Planungen werden in mehrere geschützte Cloud-Datenblöcke aufgeteilt. Bitte regelmäßig eine JSON-Sicherung exportieren.</p><small>Testversion: fest mit dem separaten Firebase-Testprojekt verbunden.</small>`}
function refresh(){if($('cloudPanel'))paint()}
// Remember which exact local version was last synchronized, without duplicating large images in storage.
function fingerprint(value){let a=2166136261,b=0x9e3779b9;for(let i=0;i<value.length;i++){let c=value.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519)}return value.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16)}
function baseline(){try{let b=JSON.parse(localStorage.getItem(BASE)||'null');return b&&b.family===familyId?b:null}catch{return null}}
function remember(snapshot,revision){localStorage.setItem(BASE,JSON.stringify({family:familyId,revision,fingerprint:fingerprint(snapshot)}))}
function locallyUnchanged(){let b=baseline();return !!b&&b.fingerprint===fingerprint(JSON.stringify(state))}
function setFamily(id){familyId=id;localStorage.setItem(FAMILY,id);rev=0;localStorage.removeItem(REV);localStorage.removeItem(BASE);dirty=false;localStorage.removeItem(PENDING);conflict=false;paint()}
function doc(){return db.collection('families').doc(familyId).collection('shared').doc('planner')}

const MAX_CHUNK=180000;
function cloudChunks(){return doc().collection('chunks')}
function splitPayload(snapshot){
  const parts=[];let part='',bytes=0;
  for(const character of snapshot){
    const size=new TextEncoder().encode(character).length;
    if(bytes+size>MAX_CHUNK&&part){parts.push(part);part='';bytes=0}
    part+=character;bytes+=size;
  }
  if(part)parts.push(part);
  if(parts.length>300)throw Error('Zu viele Daten für eine sichere Synchronisierung.');
  return parts;
}
async function readPayload(data){
  if(data.format!=='chunks-v1') {
    if(typeof data.json!=='string')throw Error('Cloud-Daten fehlen.');
    return data.json;
  }
  if(!Array.isArray(data.chunkIds)||!data.chunkIds.length||data.chunkIds.length>300||data.chunkIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)))throw Error('Ungültige Bild-/Datenaufteilung.');
  const parts=[];
  for(let i=0;i<data.chunkIds.length;i+=10){
    const ids=data.chunkIds.slice(i,i+10);
    const snapshots=await Promise.all(ids.map(id=>cloudChunks().doc(id).get()));
    for(const snap of snapshots){
      if(!snap.exists||typeof snap.data().data!=='string')throw Error('Ein Cloud-Datenblock fehlt. Lokale Daten bleiben erhalten.');
      parts.push(snap.data().data);
    }
  }
  return parts.join('');
}
async function uploadLocal(){
  if(!user||!familyId){setNotice('Bitte zuerst anmelden und Familie verbinden.');return}
  if(!confirm('Du möchtest deine aktuelle lokale Planung in die Cloud hochladen. Hast du vorher eine JSON-Sicherung exportiert?'))return;
  if(!confirm('ACHTUNG: Dadurch wird die bisherige Cloud-Planung deiner Familie ersetzt. Nur fortfahren, wenn dies ausdrücklich gewünscht ist.'))return;
  await overwriteCloud(true);
}
window.wichtelCompressImage=async file=>{
  if(!file.type.startsWith('image/'))throw Error('Bitte eine Bilddatei auswählen.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Bild konnte nicht geöffnet werden.'));image.src=url});
    const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.76);
  }finally{URL.revokeObjectURL(url)}
};

function markDirty(){if(!user||!familyId||!db)return;dirty=true;localStorage.setItem(PENDING,'1');paint();clearTimeout(timer);timer=setTimeout(flush,650)}
window.wichtelCloudSave=()=>{markDirty()};
 async function flush(){if(!dirty||busy||conflict||!user||!familyId||!navigator.onLine)return;if(!rev){conflict=true;setNotice('Cloud-Version noch nicht geladen. Bitte zuerst die Daten prüfen.');return}busy=true;paint();const snapshot=JSON.stringify(state);
  try{const chunks=splitPayload(snapshot),generation=crypto.randomUUID(),ids=chunks.map((_,i)=>generation+'_'+i);
   // Upload immutable chunks first. The planner pointer changes only after all uploads succeed.
   for(let i=0;i<chunks.length;i+=350){const batch=db.batch();for(let j=i;j<Math.min(i+350,chunks.length);j++)batch.set(cloudChunks().doc(ids[j]),{data:chunks[j],createdBy:user.uid});await batch.commit()}
   const result=await db.runTransaction(async tx=>{let ref=doc(),snap=await tx.get(ref);if(!snap.exists||snap.data().revision!==rev)throw Error('CONFLICT');const next=rev+1;tx.update(ref,{format:'chunks-v1',chunkIds:ids,json:firebase.firestore.FieldValue.delete(),revision:next,modifiedBy:user.uid,modifiedAt:firebase.firestore.FieldValue.serverTimestamp()});return next});
   rev=result;localStorage.setItem(REV,String(rev));remember(snapshot,rev);if(JSON.stringify(state)===snapshot){dirty=false;localStorage.removeItem(PENDING)}notice='';
  }catch(e){if(e.message==='CONFLICT'){conflict=true;notice='Änderungskonflikt: Bitte erst eine Sicherung exportieren und dann Version wählen.'}else notice='Cloud-Speichern fehlgeschlagen: '+e.message}
  finally{busy=false;paint();if(dirty&&!conflict&&navigator.onLine){clearTimeout(timer);timer=setTimeout(flush,5000)}}}
async function attach(){if(!db||!user||!familyId)return;const attachedFamily=familyId;try{let fam=await db.collection('families').doc(familyId).get();if(!fam.exists||!fam.data().members?.[user.uid])throw Error('Du bist für diese Familie nicht freigeschaltet. Der Gründer muss zuerst deine UID hinzufügen.');unsubscribe=doc().onSnapshot(async snap=>{
  if(!snap.exists||familyId!==attachedFamily)return;let d=snap.data();const seq=++readSequence;
  if(dirty){if(d.revision!==rev){conflict=true;notice='Cloud und lokale Daten unterscheiden sich. Bitte Sicherung exportieren.'}paint();return}
  if(conflict)return;
  if($('modal')?.open){notice='Cloud geändert. Bitte Bearbeitungsfenster schließen.';paint();return}
  try{let payload=await readPayload(d),next=JSON.parse(payload);if(!Array.isArray(next.years)||!Array.isArray(next.library))throw Error('Ungültige Daten');
   if(seq!==readSequence||dirty||conflict||familyId!==attachedFamily)return;
   const local=JSON.stringify(state),same=local===payload;
   // A confirmed baseline for this family/revision plus no pending local save means
   // the client has not intentionally edited the planner since the last sync.
   // A byte-for-byte fingerprint may differ after schema migration or normalization.
   // Keep the conservative conflict behavior for first-time/unknown local states.
   const confirmed=baseline();
   const safeToApply=locallyUnchanged() || (!!confirmed && confirmed.revision===rev && !dirty);
   if(!same&&!safeToApply){
     conflict=true;notice='Lokale und Cloud-Planung unterscheiden sich. Bitte zuerst JSON-Sicherung exportieren und dann bewusst die gewünschte Version auswählen.';paint();return;
   }
   if(!same){state=next;migrate();localStorage.setItem(KEY,JSON.stringify(state));render()}
   rev=d.revision;localStorage.setItem(REV,String(rev));remember(JSON.stringify(state),rev);notice='';paint();
  }catch(e){notice='Cloud-Daten konnten nicht gelesen werden: '+e.message;paint()}
 },e=>setNotice('Cloud-Zugriff fehlgeschlagen: '+e.message));paint();if(dirty)flush();}
 catch(e){setNotice('Familie konnte nicht verbunden werden: '+e.message)}}
async function createFamily(){if(!user)return;try{let ref=db.collection('families').doc(),id=ref.id;await ref.set({ownerUid:user.uid,members:{[user.uid]:true},createdAt:firebase.firestore.FieldValue.serverTimestamp()});const payload=JSON.stringify(state),pieces=splitPayload(payload),generation=crypto.randomUUID(),ids=pieces.map((_,i)=>generation+'_'+i);for(let i=0;i<pieces.length;i+=350){const batch=db.batch();for(let j=i;j<Math.min(i+350,pieces.length);j++)batch.set(ref.collection('shared').doc('planner').collection('chunks').doc(ids[j]),{data:pieces[j],createdBy:user.uid});await batch.commit()}await ref.collection('shared').doc('planner').set({format:'chunks-v1',chunkIds:ids,revision:1,modifiedBy:user.uid,modifiedAt:firebase.firestore.FieldValue.serverTimestamp()});setFamily(id);rev=1;localStorage.setItem(REV,'1');remember(payload,rev);await attach();setNotice('Familie erstellt. Teile die Familien-ID mit deinem Partner. Er meldet sich mit seinem eigenen Konto an und schickt dir seine UID.')}catch(e){setNotice('Familie erstellen fehlgeschlagen: '+e.message)}}
async function join(e){e.preventDefault();let fid=e.target.family.value.trim();if(!fid)return;let old=familyId;setFamily(fid);try{let f=await db.collection('families').doc(fid).get();if(!f.exists||!f.data().members?.[user.uid])throw Error('Noch keine Freigabe. Bitte erst UID vom Familiengründer hinzufügen lassen.');await attach();setNotice('Familie verbunden. Die gemeinsame Cloud-Version wird geladen.')}catch(err){setFamily(old);setNotice(err.message)}}
async function addMember(e){e.preventDefault();let uid=e.target.uid.value.trim();if(!uid)return;try{let ref=db.collection('families').doc(familyId);await db.runTransaction(async tx=>{let f=await tx.get(ref);if(f.data()?.ownerUid!==user.uid)throw Error('Nur der Familiengründer kann Mitglieder hinzufügen.');tx.update(ref,{['members.'+uid]:true})});setNotice('Partner freigeschaltet. Er kann jetzt mit der Familien-ID beitreten.')}catch(err){setNotice('Freigabe fehlgeschlagen: '+err.message)}}
async function takeCloud(){if(!confirm('Lokale Änderungen verwerfen und Cloud-Version laden? Bitte vorher Daten exportieren.'))return;try{let d=(await doc().get()).data();let next=JSON.parse(await readPayload(d));if(!Array.isArray(next.years)||!Array.isArray(next.library))throw Error('Ungültige Daten');state=next;migrate();localStorage.setItem(KEY,JSON.stringify(state));rev=d.revision;localStorage.setItem(REV,String(rev));remember(JSON.stringify(state),rev);dirty=false;conflict=false;localStorage.removeItem(PENDING);render();paint()}catch(e){setNotice('Laden fehlgeschlagen: '+e.message)}}
async function overwriteCloud(confirmed=false){if(!confirmed&&!confirm('ACHTUNG: Die neueren Änderungen auf dem anderen Gerät werden überschrieben. Wirklich deine lokale Version hochladen?'))return;try{let current=await doc().get();rev=current.data().revision;localStorage.setItem(REV,String(rev));conflict=false;dirty=true;localStorage.setItem(PENDING,'1');await flush()}catch(e){setNotice('Überschreiben fehlgeschlagen: '+e.message)}}
async function credentials(e,create){e.preventDefault();try{let email=e.target.email.value.trim(),pass=e.target.password.value;if(create)await auth.createUserWithEmailAndPassword(email,pass);else await auth.signInWithEmailAndPassword(email,pass);notice='';paint()}catch(err){setNotice('Anmeldung fehlgeschlagen: '+err.message)}}
window.WichtelSync={configure(e){e.preventDefault();try{let c=JSON.parse(e.target.config.value);if(!c.apiKey||!c.authDomain||!c.projectId||!c.appId)throw Error('apiKey, authDomain, projectId und appId werden benötigt.');if(c.projectId!=='testumgebung-wichtelzauber')throw Error('Das Produktivprojekt darf in der Testversion nicht verwendet werden.');localStorage.setItem(CONF,JSON.stringify(c));init()}catch(err){setNotice('Konfiguration ungültig: '+err.message)}},signIn:e=>credentials(e,false),register:e=>credentials(e,true),signOut:async()=>{await auth.signOut();paint()},createFamily,join,addMember,takeCloud,overwriteCloud,uploadLocal,leave(){if(!confirm('Familie auf diesem Gerät trennen? Die Cloud-Daten werden nicht gelöscht.'))return;if(unsubscribe)unsubscribe();unsubscribe=null;familyId='';localStorage.removeItem(FAMILY);localStorage.removeItem(REV);localStorage.removeItem(BASE);localStorage.removeItem(PENDING);rev=0;dirty=false;conflict=false;paint()},resetConfig(){if(!confirm('Firebase-Konfiguration nur auf diesem Gerät entfernen?'))return;localStorage.removeItem(CONF);location.reload()}};
window.addEventListener('online',()=>{if(dirty)flush()});
const originalRender=render;render=function(){originalRender();refresh()};
init();
})();
