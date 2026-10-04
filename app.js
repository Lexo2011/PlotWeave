const cfg=window.CONFIG||{},$=s=>document.querySelector(s);
const ADMIN=(cfg.ADMIN_USERNAME||'admin').toLowerCase();
const ADMIN_EMAIL=cfg.ADMIN_EMAIL||'admin@example.com',SHARED=cfg.SHARED_EMAIL||'shared@example.com';
const TZ=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=d=>d?new Date(d).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'-';

// Texts the admin can change in the admin panel: [key, label in the admin form, default text].
// Site-wide texts are stored in the settings table.
const SITE=[
  ['app_name','Name der Seite',cfg.APP_NAME||'Plot Weave'],
  ['tagline','Text unter dem Namen',cfg.APP_DESCRIPTION||'Geschichten wandern durch einen Kreis von Schreibenden – Absatz für Absatz.'],
  ['gate_label','Beschriftung des Passwortfelds','Passwort'],
  ['gate_button','Knopf unter dem Passwortfeld','Eintreten'],
  ['login_label','Beschriftung des Namensfelds','Benutzername'],
  ['login_button','Knopf unter dem Namensfeld','Weiter'],
  ['signed_in','Anzeige oben rechts ({name} wird ersetzt)','Angemeldet als {name}'],
  ['sign_out','Knopf zum Abmelden','Abmelden'],
  ['join_prompt','Über den Kreisen, denen man beitreten kann','Tritt einem Kreis bei, um mitzuschreiben:'],
  ['no_circle','Wenn kein Kreis offen ist','Zurzeit ist kein Kreis offen. Schau bald wieder vorbei.'],
  ['finished_heading','Überschrift der veröffentlichten Geschichten','Veröffentlichte Geschichten'],
  ['finished_empty','Wenn noch keine Geschichte veröffentlicht ist','Noch keine veröffentlichten Geschichten.'],
  ['untitled','Name einer Geschichte ohne Titel','Ohne Titel'],
  ['back','Link von einer Geschichte zurück zur Liste','Zurück zur Liste']];
// Texts a writer sees inside a circle are stored on that circle (circles.texts).
const CIRCLE=[
  ['start','Wenn jemand eine Geschichte beginnen soll','Beginne eine neue Geschichte. Schreibe ihren ersten Absatz.'],
  ['continue','Wenn jemand eine Geschichte fortsetzen soll','Setze diese Geschichte fort:'],
  ['waiting','Wenn jemand gerade nicht an der Reihe ist','Gerade bist du nicht an der Reihe. Die nächste Geschichte kommt, wenn der nächste Tag beginnt.'],
  ['submitted','Nach dem Schreiben','Dein Absatz ist gespeichert. Du kannst ihn ändern, bis der nächste Tag beginnt.'],
  ['so_far','Über der Geschichte, nach dem Schreiben','Die Geschichte bisher:'],
  ['next','Nächste Weitergabe ({time} wird ersetzt; nur mit täglicher Uhrzeit)','Die Geschichten werden am {time} weitergegeben.'],
  ['label','Beschriftung des Textfelds','Dein Absatz'],
  ['submit','Knopf zum Hinzufügen','Zur Geschichte hinzufügen'],
  ['save','Knopf zum Ändern','Änderungen speichern']];
let site={};try{site=JSON.parse(localStorage.getItem('site'))||{}}catch{}
const txt=k=>site[k]||SITE.find(x=>x[0]===k)[2];
const ctxt=(c,k)=>(c&&c.texts&&c.texts[k])||CIRCLE.find(x=>x[0]===k)[2];
const applySite=()=>{document.title=txt('app_name');document.querySelectorAll('[data-t]').forEach(e=>e.textContent=txt(e.dataset.t))};
const field=([k,l,d],v,p='')=>`<label>${l}<input name="${p+k}" value="${esc(v||'')}" placeholder="${esc(d)}"></label>`;
applySite();

if(!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase)){
  document.querySelector('main').innerHTML='<p>Trage die Supabase-URL und den anon key in config.js ein.</p>';
}else{
const mk=o=>supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,o);
// Two separate sessions: the site password (siteC) and the admin login (adminC), so admin sign-out keeps the site unlocked.
const siteC=mk(),adminC=mk({auth:{storageKey:'plotweave-admin'}});let sb=siteC;
let me=null,isAdmin=false,editing=false,max=500,reading=null;const openRows=new Set(),openCfg=new Set();
const rpc=async(f,a)=>{const{data,error}=await sb.rpc(f,a);if(error)throw error;return data};
const show=(id,on)=>{$('#'+id).hidden=!on};
const act=async f=>{try{await f();await render()}catch(x){alert(x.message)}};
const byTime=(a,b)=>a.created_at<b.created_at?-1:1,T=x=>+new Date(x);
// Pictures are shrunk in the browser and stored as data: URLs in the stories table.
const shrink=(file,max)=>new Promise((ok,no)=>{const i=new Image();
  i.onload=()=>{const k=Math.min(1,max/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(i,0,0,c.width,c.height);URL.revokeObjectURL(i.src);ok(c.toDataURL('image/jpeg',.82))};
  i.onerror=()=>no(new Error('Das Bild konnte nicht gelesen werden.'));i.src=URL.createObjectURL(file)});

async function loadSite(){
  const{data}=await siteC.from('settings').select('key,value');if(!data)return;
  site=Object.fromEntries(data.map(x=>[x.key,x.value]));localStorage.setItem('site',JSON.stringify(site));applySite();
}

async function render(){
  const[x,y]=await Promise.all([siteC.auth.getSession(),adminC.auth.getSession()]);
  isAdmin=!!y.data.session&&y.data.session.user.email===ADMIN_EMAIL;sb=isAdmin?adminC:siteC;
  const ses=x.data.session||isAdmin;
  me=isAdmin?ADMIN:(ses?localStorage.getItem('author'):null);
  if(me===ADMIN&&!isAdmin)me=null;
  document.body.classList.toggle('wide',isAdmin);
  show('gate',!ses);show('login',!!ses&&!me);show('app',!!me&&!isAdmin);show('admin',isAdmin);show('finished',!!ses);
  $('#who').textContent=me?txt('signed_in').replace('{name}',me):'';show('out',!!me);
  if(me&&!isAdmin)await renderUser();
  if(isAdmin)await renderAdmin();
  if(ses)await renderFinished();
}

async function renderUser(){
  const s=await rpc('my_state',{p_user:me}),t=s.turn,c=s.circle,L=k=>esc(ctxt(c,k));let h;
  editing=!!(t&&t.done);max=c?c.max_chars:500;
  const ctx=t?t.parts.map((p,i)=>(i&&p.n!==t.parts[i-1].n+1?'<p class="note">…</p>':'')+`<blockquote>${esc(p.body)}</blockquote>`).join(''):'';
  if(!c)h=s.joinable.length?`<p>${esc(txt('join_prompt'))}</p>`+s.joinable.map(j=>`<div class="join"><button data-join="${j.id}">${esc(j.name)}</button>${j.description?` <span class="note">${esc(j.description)}</span>`:''}</div>`).join(''):`<p>${esc(txt('no_circle'))}</p>`;
  else{
    h=`<h2>${esc(c.name)}</h2>`+(c.description?`<p class="desc">${esc(c.description)}</p>`:'');
    if(!t)h+=`<p>${L('waiting')}</p>`;
    else if(t.done)h+=(ctx?`<p>${L('so_far')}</p>`+ctx:'')+`<p>${L('submitted')}</p>`;
    else if(!t.story_id)h+=`<p>${L('start')}</p>`;
    else h+=`<p>${L('continue')}</p>`+ctx;
    if(c.next)h+=`<p class="note">${L('next').replace('{time}',fmt(c.next))}</p>`;
  }
  $('#prompt').innerHTML=h;show('form',!!t);
  if(t){$('#textlabel').textContent=ctxt(c,'label');$('#text').maxLength=max;$('#text').value=t.done?t.own:'';$('#count').textContent=$('#text').value.length+'/'+max;$('#send').textContent=ctxt(c,t.done?'save':'submit')}
}

async function renderAdmin(){
  await rpc('tick');  // hands out turns for circles whose daily time has passed
  const[a,b]=await Promise.all([
    sb.from('circles').select('*,members(username),stories(id,starter,created_at,title,thumb,published_at,contributions(id,author,body,created_at,edited_at,edited_by))').is('archived_at',null).order('created_at',{ascending:false}),
    sb.from('assignments').select('story_id,circle_id,username,done,active,missed,seen,assigned_at')]);
  if(a.error)throw a.error;if(b.error)throw b.error;
  $('#site').innerHTML=SITE.map(f=>field(f,site[f[0]])).join('')+'<p class="note">Ein leeres Feld verwendet den grau angezeigten Text.</p><button>Seiteneinstellungen speichern</button>';
  $('#circlelist').innerHTML=a.data.map(c=>{
    const asg=b.data.filter(x=>x.circle_id===c.id),mem=c.members.map(m=>m.username),pend=asg.filter(x=>x.active&&!x.done);
    const missed=(u,sid)=>asg.some(x=>x.missed&&x.username===u&&x.story_id===sid);
    // finished: no open turn, and every member has written or missed their turn to start a story and their turn in every story
    const full=c.stories.length>0&&!pend.length&&mem.every(u=>(c.stories.some(s=>s.starter===u)||missed(u,null))&&c.stories.every(s=>s.contributions.some(x=>x.author===u)||missed(u,s.id)));
    const rows=c.stories.map(s=>{
      const cons=s.contributions.sort(byTime),p=pend.find(x=>x.story_id===s.id),o=openRows.has(s.id);
      const ev=cons.map(x=>x.edited_at&&T(x.edited_at)>T(x.created_at)?{t:x.edited_at,by:x.edited_by||x.author}:{t:x.created_at,by:x.author}).sort((x,y)=>T(x.t)-T(y.t)).at(-1)||{t:s.created_at,by:s.starter};
      const skip=mem.filter(u=>missed(u,s.id)),left=mem.filter(u=>!cons.some(x=>x.author===u)&&!skip.includes(u));
      // whoever has the turn right now comes first, in bold
      const now=p&&p.username,todo=left.sort((x,y)=>(y===now)-(x===now)).map(u=>u===now?`<strong>${esc(u)}</strong> (ist dran)`:esc(u)).join(', ')||'niemand';
      // a story is published on its own, once its circle is concluded
      const pub=c.concluded?`<form class="fields pub" data-story="${s.id}"><label>Titel<input name="title" maxlength="120" value="${esc(s.title||'')}"></label><label>Bild${s.thumb?' ersetzen':''}<input name="image" type="file" accept="image/*"></label>`
        +(s.thumb?`<img class="thumb" src="${esc(s.thumb)}" alt=""><label class="check"><input name="noimg" type="checkbox"> Bild entfernen</label>`:'')
        +`<p><button name="do" value="save">Titel und Bild speichern</button> <button name="do" value="${s.published_at?'unpub':'pub'}">${s.published_at?'Veröffentlichung zurücknehmen':'Veröffentlichen'}</button></p></form>`
        :'<p class="note">Veröffentlichen ist möglich, sobald der Kreis abgeschlossen ist.</p>';
      return `<tr><td>${esc(s.starter)}</td><td>${fmt(s.created_at)}</td><td>${cons.length}</td><td>${todo}</td><td>${skip.map(esc).join(', ')||'-'}</td><td>${esc(ev.by)}</td><td>${fmt(ev.t)}</td><td>${s.published_at?'ja'+(s.title?': '+esc(s.title):''):'nein'}</td><td><button class="link" data-toggle="${s.id}">${o?'Schließen':'Bearbeiten'}</button></td></tr>`
        +`<tr class="editrow" id="e-${s.id}"${o?'':' hidden'}><td colspan="9">`+pub+cons.map(x=>`<div class="edit"><small><strong>${esc(x.author)}</strong> · geschrieben am ${fmt(x.created_at)}${x.edited_at?` · zuletzt geändert von ${esc(x.edited_by||x.author)} am ${fmt(x.edited_at)}`:''}</small><textarea maxlength="${c.max_chars}" data-id="${x.id}">${esc(x.body)}</textarea><button data-save="${x.id}">Speichern</button></div>`).join('')+'</td></tr>';
    }).join('');
    const starting=pend.filter(x=>!x.story_id).map(x=>esc(x.username));
    const news=asg.filter(x=>x.missed&&!x.seen).sort((x,y)=>T(x.assigned_at)-T(y.assigned_at));
    const notice=news.length?'<div class="notice"><strong>Nicht geschrieben</strong><ul>'+news.map(x=>{const s=c.stories.find(s=>s.id===x.story_id);
      return `<li>${esc(x.username)} hat ${s?'die Geschichte von '+esc(s.starter)+' nicht fortgesetzt':'keine Geschichte begonnen'} (an der Reihe seit ${fmt(x.assigned_at)}). Der Kreis ist ohne diesen Absatz weitergegangen.</li>`}).join('')+`</ul><button class="link" data-seen="${c.id}">Als gesehen markieren</button></div>`:'';
    const when=c.distribute_at?`täglich um ${c.distribute_at.slice(0,5)} Uhr (${esc(c.tz)})`:'nur, wenn du „Nächsten Tag starten“ drückst,';
    const form=`<details data-cfg="${c.id}"${openCfg.has(c.id)?' open':''}><summary>Kreiseinstellungen</summary><form class="fields" data-circle="${c.id}">`
      +`<label>Name<input name="name" required maxlength="60" value="${esc(c.name)}"></label>`
      +`<label>Beschreibung (für Schreibende sichtbar)<textarea name="description" rows="2" maxlength="500">${esc(c.description)}</textarea></label>`
      +`<label>Geschichten täglich weitergeben um (leer: nur von Hand)<input name="distribute_at" type="time" value="${c.distribute_at?c.distribute_at.slice(0,5):''}"></label>`
      +`<label class="check"><input name="joinable" type="checkbox"${c.joinable?' checked':''}> Neue Schreibende können beitreten</label>`
      +`<label>Sichtbare Absätze vom Anfang einer Geschichte<input name="visible_first" type="number" min="0" max="50" required value="${c.visible_first}"></label>`
      +`<label>Sichtbare Absätze vom Ende einer Geschichte<input name="visible_last" type="number" min="0" max="50" required value="${c.visible_last}"></label>`
      +`<label>Maximale Länge eines Absatzes (Zeichen)<input name="max_chars" type="number" min="50" max="5000" required value="${c.max_chars}"></label>`
      +'<h4>Texte, die Schreibende in diesem Kreis sehen</h4>'+CIRCLE.map(f=>field(f,c.texts&&c.texts[f[0]],'t_')).join('')
      +`<p class="note">Ein leeres Textfeld verwendet den grau angezeigten Text. Die Uhrzeit gilt in deiner Zeitzone (${esc(TZ)}).</p><button>Kreiseinstellungen speichern</button></form></details>`;
    return `<article><h3>${esc(c.name)}${c.concluded?' (abgeschlossen)':''}</h3>${notice}<p class="note">Mitglieder: ${mem.map(esc).join(', ')||'noch keine'}${starting.length?'. Sollen eine Geschichte beginnen: '+starting.join(', '):''}</p>`
      +(c.concluded?'':`<p class="note">Die Geschichten werden ${when} weitergegeben. Zuletzt: ${fmt(c.last_distributed_at)}.</p>`)
      +(rows?`<div class="tablewrap"><table><tr><th>Begonnen von</th><th>Begonnen am</th><th>Absätze</th><th>Noch zu schreiben</th><th>Verpasst</th><th>Zuletzt geändert von</th><th>Zuletzt geändert am</th><th>Veröffentlicht</th><th></th></tr>${rows}</table></div>`:'<p class="note">Noch keine Geschichten.</p>')
      +'<p>'+(!c.concluded?`<button data-newday="${c.id}">Nächsten Tag starten</button> `:'')+(!c.concluded&&full?`<button data-conclude="${c.id}">Kreis abschließen</button> `:'')+`<button class="link" data-del="${c.id}">Kreis löschen</button></p>${form}</article>`;
  }).join('')||'<p>Noch keine Kreise. Erstelle oben einen.</p>';
}

// Published stories: a list, or the one that was clicked. No names of who wrote what.
async function renderFinished(){
  const s=reading&&await rpc('published_story',{p_id:reading});
  if(s){$('#done').innerHTML=`<button class="link" data-back>← ${esc(txt('back'))}</button><h3>${esc(s.title||txt('untitled'))}</h3>`+(s.image?`<img class="cover" src="${esc(s.image)}" alt="">`:'')+s.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('');return}
  reading=null;
  $('#done').innerHTML=(await rpc('published_stories')).map(s=>`<button class="card" data-read="${s.id}">${s.thumb?`<img src="${esc(s.thumb)}" alt="">`:'<span class="noimg"></span>'}<span>${esc(s.title||txt('untitled'))}</span></button>`).join('')||`<p>${esc(txt('finished_empty'))}</p>`;
}

$('#gate').onsubmit=async e=>{e.preventDefault();
  const{error}=await siteC.auth.signInWithPassword({email:SHARED,password:$('#sitepw').value});
  if(error)return alert('Falsches Passwort.');$('#sitepw').value='';render()};
$('#id').oninput=e=>{const on=e.target.value.trim().toLowerCase()===ADMIN;show('adminrow',on);$('#adminpw').required=on};
$('#login').onsubmit=async e=>{e.preventDefault();const n=$('#id').value.trim().toLowerCase();
  if(n===ADMIN){
    const{error}=await adminC.auth.signInWithPassword({email:ADMIN_EMAIL,password:$('#adminpw').value});
    if(error)return alert('Falsches Admin-Passwort.');$('#adminpw').value='';
  }else localStorage.setItem('author',n);
  render()};
$('#out').onclick=async()=>{localStorage.removeItem('author');if(isAdmin)await adminC.auth.signOut();render()};
$('#prompt').onclick=e=>{const id=e.target.dataset.join;if(id)act(()=>rpc('join_circle',{p_user:me,p_circle:id}))};
$('#text').oninput=e=>$('#count').textContent=e.target.value.length+'/'+max;
$('#form').onsubmit=e=>{e.preventDefault();act(()=>rpc(editing?'edit_turn':'submit_turn',{p_user:me,p_body:$('#text').value}))};
$('#newcircle').onsubmit=e=>{e.preventDefault();act(async()=>{const{error}=await sb.from('circles').insert({name:$('#cname').value.trim(),tz:TZ});if(error)throw error;$('#cname').value=''})};
$('#site').onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target)),set=[],del=[];
  SITE.forEach(([k])=>{const t=v[k].trim();t?set.push({key:k,value:t}):del.push(k)});
  act(async()=>{
    for(const r of[set.length&&await sb.from('settings').upsert(set),del.length&&await sb.from('settings').delete().in('key',del)])if(r&&r.error)throw r.error;
    await loadSite()})};
// The settings form of one circle (the forms are re-created on every render, so this listens on the whole admin section).
$('#done').onclick=e=>{const b=e.target.closest('[data-read],[data-back]');if(!b)return;reading=b.dataset.read||null;
  renderFinished().then(()=>$('#finished').scrollIntoView({behavior:'smooth'})).catch(x=>alert(x.message))};
// Title, picture and publishing of one story.
$('#admin').addEventListener('submit',e=>{const f=e.target,sid=f.dataset.story;if(!sid)return;e.preventDefault();
  const file=f.elements.image.files[0],what=e.submitter&&e.submitter.value,up={title:f.elements.title.value.trim()||null};
  act(async()=>{
    if(file){up.image=await shrink(file,1400);up.thumb=await shrink(file,480)}else if(f.elements.noimg&&f.elements.noimg.checked)up.image=up.thumb=null;
    if(what==='pub')up.published_at=new Date().toISOString();if(what==='unpub')up.published_at=null;
    const{error}=await sb.from('stories').update(up).eq('id',sid);if(error)throw error})});
$('#admin').addEventListener('submit',e=>{const id=e.target.dataset.circle;if(!id)return;e.preventDefault();
  const v=Object.fromEntries(new FormData(e.target)),texts={};
  CIRCLE.forEach(([k])=>{const t=v['t_'+k].trim();if(t)texts[k]=t});
  act(async()=>{const{error}=await sb.from('circles').update({name:v.name.trim(),description:v.description.trim(),joinable:'joinable' in v,distribute_at:v.distribute_at||null,tz:TZ,
    visible_first:+v.visible_first,visible_last:+v.visible_last,max_chars:+v.max_chars,texts}).eq('id',id);if(error)throw error})});
$('#admin').addEventListener('toggle',e=>{const id=e.target.dataset.cfg;if(id)e.target.open?openCfg.add(id):openCfg.delete(id)},true);
$('#admin').onclick=e=>{const d=e.target.dataset;
  if(d.toggle){const r=$('#e-'+d.toggle);r.hidden=!r.hidden;r.hidden?openRows.delete(d.toggle):openRows.add(d.toggle);e.target.textContent=r.hidden?'Bearbeiten':'Schließen'}
  if(d.save)act(async()=>{const{error}=await sb.from('contributions').update({body:document.querySelector(`textarea[data-id="${d.save}"]`).value.trim(),edited_at:new Date().toISOString(),edited_by:ADMIN}).eq('id',d.save);if(error)throw error});
  if(d.seen)act(async()=>{const{error}=await sb.from('assignments').update({seen:true}).eq('circle_id',d.seen).eq('missed',true);if(error)throw error});
  if(d.conclude)act(()=>rpc('conclude_circle',{p_circle:d.conclude}));
  if(d.newday&&confirm('Den nächsten Tag für diesen Kreis starten? Wer bis jetzt nicht geschrieben hat, wird übersprungen, und der Absatz von gestern kann nicht mehr geändert werden.'))act(async()=>{alert(await rpc('run_new_day',{p_circle:d.newday})+' Schreibende sind jetzt an der Reihe.')});
  // deleting only archives: the circle disappears everywhere but stays in the database
  if(d.del&&confirm('Diesen Kreis löschen? Er verschwindet für alle. Die Daten bleiben archiviert in der Datenbank.'))act(async()=>{const{error}=await sb.from('circles').update({archived_at:new Date().toISOString()}).eq('id',d.del);if(error)throw error})};
loadSite().then(render).catch(x=>alert(x.message));
}
