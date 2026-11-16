// The advent calendar: its own page behind the site password. The admin (logged in on index.html) edits it right here.
const cfg=window.CONFIG||{},$=s=>document.querySelector(s);
const ADMIN_EMAIL=cfg.ADMIN_EMAIL||'admin@example.com',SHARED=cfg.SHARED_EMAIL||'shared@example.com';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Texts the admin can change (Kalendereinstellungen): [key, label in the form, default text]. Stored in the settings table.
const TEXTS=[
  ['advent_title','Name des Kalenders','Adventskalender'],
  ['advent_intro','Text unter dem Namen','Jeden Tag öffnet sich ein neues Türchen.'],
  ['advent_home','Link oben links zur Hauptseite','Home'],
  ['advent_begin','Zeile über den Türchen ({date} wird ersetzt)','Beginn: {date}'],
  ['advent_soon','Solange der Kalender noch nicht eingerichtet ist','Der Kalender ist noch nicht fertig. Schau bald wieder vorbei.'],
  ['advent_closed','Beim Klick auf ein geschlossenes Türchen ({date} wird ersetzt)','Dieses Türchen öffnet sich am {date}.'],
  ['advent_ok','Knopf, der die Meldung zum geschlossenen Türchen schließt','OK'],
  ['advent_door','Überschrift eines Türchens ({n} wird ersetzt)','Türchen {n}'],
  ['advent_empty','Wenn hinter einem Türchen nichts ist','Hinter diesem Türchen ist noch nichts.'],
  ['advent_by','Autorenzeile ({name} wird ersetzt)','von {name}'],
  ['advent_back','Link vom Türchen zurück zum Kalender','Zurück zum Kalender'],
  ['advent_back_door','Link von einem Inhalt zurück zum Türchen','Zurück zum Türchen'],
  ['gate_label','Beschriftung des Passwortfelds (gilt auch auf der Hauptseite)','Passwort'],
  ['gate_button','Knopf unter dem Passwortfeld (gilt auch auf der Hauptseite)','Eintreten']];
const KIND={story:'Geschichte',image:'Bild',video:'Video'};
let site={};try{site=JSON.parse(localStorage.getItem('site'))||{}}catch{}
const txt=k=>site[k]||TEXTS.find(x=>x[0]===k)[2];
const applySite=()=>{document.title=txt('advent_title');document.querySelectorAll('[data-t]').forEach(e=>e.textContent=txt(e.dataset.t))};
applySite();

if(!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase)){
  document.querySelector('main').innerHTML='<p>Trage die Supabase-URL und den anon key in config.js ein.</p>';
}else{
const mk=o=>supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,o);
// the same two sessions as on index.html
const siteC=mk(),adminC=mk({auth:{storageKey:'plotweave-admin'}});let sb=siteC;
let isAdmin=false,cal=null,door=null,item=null,items=[],stories=[],used=[],names={};
const rpc=async(f,a)=>{const{data,error}=await sb.rpc(f,a);if(error)throw error;return data};
const q=async p=>{const{data,error}=await p;if(error)throw error;return data};
const show=(id,on)=>{$('#'+id).hidden=!on};
const act=async f=>{document.body.classList.add('busy');try{await f();await render()}catch(x){alert(x.message)}finally{document.body.classList.remove('busy')}};
const day=n=>{const d=new Date(cal.start+'T12:00');d.setDate(d.getDate()+n-1);return d};
// The number on a door: counting down to the last day (as on the first day's door: the number of doors), or counting up from 1. Works both ways.
const lab=n=>site.advent_countdown==='0'?n:cal.days-n+1;
const dm=(n,o)=>day(n).toLocaleDateString('de-DE',o||{day:'numeric',month:'short'});
const jpeg=(src,w,h,max)=>{const k=Math.min(1,max/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(src,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.82)};
// Pictures are shrunk in the browser. Preview pictures are stored as data: URLs in the row, the files themselves in the storage bucket.
const shrink=(file,max)=>new Promise((ok,no)=>{const i=new Image();
  i.onload=()=>{URL.revokeObjectURL(i.src);ok(jpeg(i,i.width,i.height,max))};
  i.onerror=()=>no(new Error('Das Bild konnte nicht gelesen werden.'));i.src=URL.createObjectURL(file)});
// A frame from the first second of a video as its preview picture (null if the browser cannot show the video).
const frame=file=>new Promise(ok=>{const v=document.createElement('video'),done=x=>{URL.revokeObjectURL(v.src);ok(x)};
  v.muted=true;v.playsInline=true;v.preload='auto';
  v.onloadeddata=()=>{v.currentTime=Math.min(1,(v.duration||0)/2)};
  v.onseeked=()=>{try{done(jpeg(v,v.videoWidth,v.videoHeight,640))}catch{done(null)}};
  v.onerror=()=>done(null);setTimeout(()=>done(null),8000);v.src=URL.createObjectURL(file)});
const blob=async url=>(await fetch(url)).blob();
const bucket=()=>sb.storage.from('advent');
async function upload(file,kind){
  const body=kind==='image'?await blob(await shrink(file,2000)):file,ext=kind==='image'?'jpg':(file.name.split('.').pop()||'mp4').toLowerCase().replace(/[^a-z0-9]/g,'');
  const name=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2))+'.'+ext,{error}=await bucket().upload(name,body,{contentType:kind==='image'?'image/jpeg':file.type||'video/mp4'});
  if(error)throw new Error('Hochladen hat nicht geklappt: '+error.message);return name;
}

async function loadSite(){
  const{data}=await siteC.from('settings').select('key,value');if(!data)return;
  site=Object.fromEntries(data.map(x=>[x.key,x.value]));localStorage.setItem('site',JSON.stringify(site));applySite();
}

async function render(){
  const[x,y]=await Promise.all([siteC.auth.getSession(),adminC.auth.getSession()]);
  isAdmin=!!y.data.session&&y.data.session.user.email===ADMIN_EMAIL;sb=isAdmin?adminC:siteC;
  const ses=x.data.session||isAdmin;
  document.body.classList.toggle('wide',isAdmin);
  show('gate',!ses);show('cal',!!ses);show('tools',isAdmin);$('#who').textContent=isAdmin?'Bearbeitungsmodus':'';
  if(!ses)return;
  // the database decides who is admin (is_admin() in setup.sql); say so plainly when it disagrees with this page
  if(isAdmin&&!await rpc('is_admin'))alert(`Die Datenbank erkennt dich nicht als Admin, darum kann nichts gespeichert werden. Melde dich auf der Hauptseite ab und wieder als Admin an. (Angemeldet: ${y.data.session.user.email})`);
  cal=await rpc('advent');
  $('#begin').textContent=cal.start&&cal.days?txt('advent_begin').replace('{date}',dm(1,{day:'numeric',month:'numeric'})):'';
  // the address says what is open (#28 = the door showing 28, #28/<id> = one item behind it), so links, back and forward work
  const[h,id]=decodeURIComponent(location.hash.slice(1)).split('/'),k=parseInt(h),n=site.advent_countdown==='0'?k:cal.days-k+1;
  door=k>0&&n>=1&&n<=cal.days?n:null;item=door&&id||null;
  if(door&&!cal.doors.some(d=>d.n===door&&(d.open||isAdmin))){closed(door);door=item=null;history.replaceState(null,'',location.pathname+location.search)}
  items=door?await rpc('advent_door',{p_door:door}):[];
  if(item&&!items.some(i=>i.id===item)){item=null;history.replaceState(null,'','#'+lab(door))}
  if(isAdmin)await renderTools();
  await draw();
}

const card=i=>`<button class="card" data-item="${i.id}">${i.thumb?`<img src="${esc(i.thumb)}" alt="">`:`<span class="noimg">${KIND[i.kind]}</span>`}<span>${esc(i.title||KIND[i.kind])}</span>${i.author?`<span class="note">${esc(txt('advent_by').replace('{name}',i.author))}</span>`:''}</button>`;

async function draw(){
  const c=$('#cal');document.body.classList.toggle('indoor',!!door&&!item);
  if(!door){
    c.innerHTML=cal.start&&cal.days?`<div class="doors">`+cal.doors.map(d=>`<button class="door${d.open?' open':''}" data-door="${d.n}" title="${dm(d.n)}">${d.image?`<img src="${esc(d.image)}" alt="${lab(d.n)}">`:`<b>${lab(d.n)}</b>`}${isAdmin?`<small>${dm(d.n)} · ${d.items}</small>`:''}</button>`).join('')+'</div>'
      :`<p>${esc(txt('advent_soon'))}</p>`;
    return;
  }
  const head=`<h2>${esc(txt('advent_door').replace('{n}',lab(door)))}</h2><p class="note">${dm(door,{weekday:'long',day:'numeric',month:'long'})}</p>`;
  const i=items.find(x=>x.id===item);
  if(i){
    // files come from the private bucket through a link that works for an hour
    let media='';
    if(i.file){const{data,error}=await bucket().createSignedUrl(i.file,3600);if(error)throw error;
      media=i.kind==='video'?`<video class="cover fit" controls playsinline preload="metadata"${i.thumb?` poster="${esc(i.thumb)}"`:''} src="${esc(data.signedUrl)}"></video>`:`<img class="cover fit" src="${esc(data.signedUrl)}" alt="">`}
    else if(i.thumb)media=`<img class="cover" src="${esc(i.thumb)}" alt="">`;
    c.innerHTML=`<button class="link" data-up>← ${esc(txt('advent_back_door'))}</button><h2>${esc(i.title||KIND[i.kind])}</h2>`+(i.author?`<p class="note">${esc(txt('advent_by').replace('{name}',i.author))}</p>`:'')
      +media+(i.body||'').split(/\n\s*\n/).filter(p=>p.trim()).map(p=>`<p class="desc">${esc(p.trim())}</p>`).join('');
    return;
  }
  c.innerHTML=`<button class="link" data-home>← ${esc(txt('advent_back'))}</button>`+head
    +(items.length?`<div class="cards">${items.map(card).join('')}</div>`:`<p>${esc(txt('advent_empty'))}</p>`)+(isAdmin?editor():'');
}

// Admin: one form per item behind this door, and one to add a new item.
function editor(){
  const st=s=>{const u=used.filter(x=>x.story_id===s.id).map(x=>x.door);return `<option value="${s.id}">${esc(s.circles.name)} – ${esc(s.title||'ohne Titel')} (begonnen von ${esc(s.starter)})${u.length?' ✓ Türchen '+u.map(lab).join(', '):''}</option>`};
  const img=cal.doors.find(d=>d.n===door).image;
  return `<h3>Bild auf dem Türchen</h3><form class="fields pub" id="front">${img?`<img class="thumb" src="${esc(img)}" alt="">`:''}<label>Bild${img?' ersetzen':''} (quadratisch, am besten mit der Zahl darauf)<input name="image" type="file" accept="image/*"></label>`
    +(img?'<label class="check"><input name="noimg" type="checkbox"> Bild entfernen</label>':'')+'<p class="note">Dieses Bild sehen alle, auch solange das Türchen geschlossen ist. Ohne Bild zeigt das Türchen nur seine Zahl.</p><button>Bild speichern</button></form>'
    +'<h3>Inhalte bearbeiten</h3>'+items.map(i=>`<form class="fields pub" data-edit="${i.id}"><h4>${KIND[i.kind]}</h4>`
    +`<label>Titel<input name="title" maxlength="200" value="${esc(i.title||'')}"></label><label>Autor<input name="author" maxlength="200" value="${esc(i.author||'')}"></label>`
    +`<label class="full">${i.kind==='story'?'Geschichte (eine Leerzeile trennt Absätze)':'Text dazu'}<textarea name="body" rows="${i.kind==='story'?12:2}">${esc(i.body||'')}</textarea></label>`
    +`<label>Vorschaubild${i.thumb?' ersetzen':''}<input name="thumb" type="file" accept="image/*"></label>`
    +(i.thumb?`<img class="thumb" src="${esc(i.thumb)}" alt=""><label class="check"><input name="nothumb" type="checkbox"> Vorschaubild entfernen</label>`:'')
    +(i.kind==='story'?'':`<label>${KIND[i.kind]} ersetzen<input name="file" type="file" accept="${i.kind}/*"></label>`)
    +`<label>Türchen<input name="door" type="number" min="1" max="${cal.days}" required value="${lab(door)}"></label><label>Reihenfolge im Türchen<input name="pos" type="number" required value="${i.pos??0}"></label>`
    +`<p><button name="do" value="save">Speichern</button> <button type="button" class="link" data-del="${i.id}">Löschen</button></p></form>`).join('')
    +`<form class="fields" id="add"><h4>Neuer Inhalt</h4><label>Art<select name="kind"><option value="story">Geschichte</option><option value="image">Bild</option><option value="video">Video</option></select></label>`
    +`<label data-for="story">Geschichte übernehmen<select name="story"><option value="">(leer beginnen)</option>${stories.map(st).join('')}</select></label>`
    +`<label data-for="file" hidden>Datei<input name="file" type="file"></label>`
    +`<p class="note">Titel, Autor, Text und Vorschaubild änderst du danach. Die übernommene Geschichte ist eine Kopie – das Original bleibt, wie es ist. Bilder werden verkleinert; ein Video darf höchstens so groß sein, wie dein Supabase-Tarif erlaubt (kostenlos: 50 MB).</p><button>Hinzufügen</button></form>`;
}

async function renderTools(){
  const[a,s,it,m]=await Promise.all([q(sb.from('authors').select('*')),
    q(sb.from('stories').select('id,title,starter,created_at,circles!inner(name,archived_at)').is('circles.archived_at',null).order('created_at')),
    q(sb.from('advent_items').select('id,door,pos,story_id')),q(sb.from('members').select('username'))]);
  names=Object.fromEntries(a.map(x=>[x.username,x.name]));stories=s;used=it;
  items.forEach(i=>i.pos=(it.find(x=>x.id===i.id)||{}).pos);
  const over=it.filter(x=>x.door>cal.days).length;
  $('#cfg').innerHTML=`<label>Erster Tag (Türchen 1)<input name="start" type="date" required value="${esc(site.advent_start||'')}"></label><label>Anzahl der Türchen (eines pro Tag)<input name="days" type="number" min="1" max="100" required value="${esc(site.advent_days||'')}"></label><label class="check"><input name="countdown" type="checkbox"${site.advent_countdown==='0'?'':' checked'}> Türchen zählen herunter (am ersten Tag die höchste Zahl, am letzten die 1)</label>`
    +(cal.start&&cal.days?`<p class="note">Der Kalender läuft vom ${dm(1,{dateStyle:'long'})} bis zum ${dm(cal.days,{dateStyle:'long'})}. Jedes Türchen öffnet sich um 0 Uhr deutscher Zeit und bleibt danach offen. Inhalte und Türchenbilder gehören zu ihrem Tag, auch wenn sich die Zahlen ändern.${over?` ${over} Inhalte liegen in Türchen über dieser Anzahl; sie bleiben gespeichert, sind aber nicht zu sehen.`:''}</p>`:'')
    +'<h4>Texte</h4>'+TEXTS.map(([k,l,d])=>`<label>${l}<input name="${k}" value="${esc(site[k]||'')}" placeholder="${esc(d)}"></label>`).join('')
    +'<p class="note">Ein leeres Textfeld verwendet den grau angezeigten Text.</p><button>Kalendereinstellungen speichern</button>';
  const users=[...new Set([...m.map(x=>x.username),...s.map(x=>x.starter),...a.map(x=>x.username)])].sort();
  $('#authors').innerHTML='<p class="note">Wird eine Geschichte in den Kalender übernommen, steht als Autor der Autorenname der Person, die sie begonnen hat. Die Benutzernamen selbst sieht im Kalender niemand.</p>'
    +users.map(u=>`<label>${esc(u)}<input name="${esc(u)}" maxlength="80" value="${esc(names[u]||'')}"></label>`).join('')+'<button>Autorennamen speichern</button>';
}

$('#gate').onsubmit=async e=>{e.preventDefault();
  const{error}=await siteC.auth.signInWithPassword({email:SHARED,password:$('#sitepw').value});
  if(error)return alert('Falsches Passwort.');$('#sitepw').value='';render().catch(x=>alert(x.message))};
$('#cal').onclick=e=>{const b=e.target.closest('[data-door],[data-item],[data-home],[data-up],[data-del]');if(!b)return;const d=b.dataset;
  if(d.del){const i=items.find(x=>x.id===d.del);
    if(confirm('Diesen Inhalt aus dem Kalender löschen? Das lässt sich nicht rückgängig machen. Die ursprüngliche Geschichte im Kreis bleibt erhalten.'))act(async()=>{await q(sb.from('advent_items').delete().eq('id',i.id));if(i.file)await bucket().remove([i.file])});
    return}
  if(d.door){const x=cal.doors.find(x=>x.n===+d.door);if(x.open||isAdmin)go(lab(x.n));else closed(x.n)}
  if(d.item)go(lab(door)+'/'+d.item);if('up' in d)go(lab(door));if('home' in d)go('')};
// every step is a new entry in the browser history; render() reads the address
const go=h=>{if(h)location.hash=h;else{history.pushState(null,'',location.pathname+location.search);nav()}};
addEventListener('hashchange',()=>nav());
const closed=n=>{$('#popmsg').textContent=txt('advent_closed').replace('{date}',dm(n,{day:'numeric',month:'long'}));$('#pop').showModal()};
// an opened picture or video is brought to the middle of the screen once it is loaded, everything else to the top
const nav=()=>act(async()=>{}).then(()=>{const m=$('.cover.fit');if(!m)return scrollTo({top:$('#cal').offsetTop-16,behavior:'smooth'});
    const mid=()=>m.scrollIntoView({block:'center',behavior:'smooth'});m.complete||m.readyState>0?mid():m.addEventListener(m.tagName==='VIDEO'?'loadedmetadata':'load',mid,{once:true})});
// the closed-door message: closes with its button, Esc or a click beside it
$('#pop').onclick=e=>{if(e.target===e.currentTarget||e.target.matches('button'))$('#pop').close()};
$('#cal').addEventListener('change',e=>{if(e.target.name!=='kind'||!e.target.form.matches('#add'))return;const k=e.target.value,f=e.target.form;
  f.querySelector('[data-for=story]').hidden=k!=='story';f.querySelector('[data-for=file]').hidden=k==='story';f.elements.file.accept=k+'/*'});
$('#cal').addEventListener('submit',e=>{e.preventDefault();const f=e.target,el=f.elements;
  if(f.id==='front')return act(async()=>{const t=el.image.files[0];
    if(t)await q(sb.from('advent_doors').upsert({door,image:await shrink(t,400)}));else if(el.noimg&&el.noimg.checked)await q(sb.from('advent_doors').delete().eq('door',door))});
  if(f.id==='add')return act(async()=>{const kind=el.kind.value,file=el.file.files[0],row={door,kind,pos:Math.max(0,...used.filter(x=>x.door===door).map(x=>x.pos))+1};
    if(kind==='story'){if(el.story.value){
      const s=await q(sb.from('stories').select('title,image,starter,contributions(body,created_at)').eq('id',el.story.value).single());
      Object.assign(row,{story_id:el.story.value,title:s.title,author:names[s.starter]||null,body:s.contributions.sort((a,b)=>a.created_at<b.created_at?-1:1).map(x=>x.body).join('\n\n'),thumb:s.image?await shrink(await blob(s.image),640):null})}}
    else{if(!file)throw new Error('Wähle zuerst eine Datei aus.');
      row.thumb=kind==='image'?await shrink(file,640):await frame(file);row.file=await upload(file,kind);row.title=file.name.replace(/\.[^.]*$/,'')}
    await q(sb.from('advent_items').insert(row))});
  const id=f.dataset.edit,i=items.find(x=>x.id===id);if(!i)return;
  act(async()=>{const up={title:el.title.value.trim()||null,author:el.author.value.trim()||null,body:el.body.value.trim()||null,door:lab(+el.door.value),pos:+el.pos.value},t=el.thumb.files[0],file=el.file&&el.file.files[0];
    if(t)up.thumb=await shrink(t,640);else if(el.nothumb&&el.nothumb.checked)up.thumb=null;
    if(file){up.file=await upload(file,i.kind);if(!t&&i.kind==='image')up.thumb=await shrink(file,640)}
    await q(sb.from('advent_items').update(up).eq('id',id));
    if(file&&i.file)await bucket().remove([i.file])})});
$('#cfg').onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target)),set=[{key:'advent_start',value:v.start},{key:'advent_days',value:String(+v.days)},{key:'advent_countdown',value:'countdown' in v?'1':'0'}],del=[];
  TEXTS.forEach(([k])=>{const t=v[k].trim();t?set.push({key:k,value:t}):del.push(k)});
  act(async()=>{await q(sb.from('settings').upsert(set));if(del.length)await q(sb.from('settings').delete().in('key',del));await loadSite()})};
$('#authors').onsubmit=e=>{e.preventDefault();const set=[],del=[];
  new FormData(e.target).forEach((n,u)=>{n=n.trim();n?set.push({username:u,name:n}):del.push(u)});
  act(async()=>{if(set.length)await q(sb.from('authors').upsert(set));if(del.length)await q(sb.from('authors').delete().in('username',del))})};
loadSite().then(render).catch(x=>alert(x.message));
}
