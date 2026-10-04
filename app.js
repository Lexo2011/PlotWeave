const cfg=window.CONFIG||{},$=s=>document.querySelector(s);
const ADMIN=(cfg.ADMIN_USERNAME||'admin').toLowerCase();
const ADMIN_EMAIL=cfg.ADMIN_EMAIL||'admin@example.com',SHARED=cfg.SHARED_EMAIL||'shared@example.com';
const TZ=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=d=>d?new Date(d).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'-';

// Texts the admin can change in the admin panel: [key, label in the admin form, default text].
// Site-wide texts are stored in the settings table.
const SITE=[
  ['app_name','Site name',cfg.APP_NAME||'Plot Weave'],
  ['tagline','Text under the site name',cfg.APP_DESCRIPTION||'Stories pass through a circle of writers, one paragraph at a time.'],
  ['gate_label','Label of the site password field','Site password'],
  ['gate_button','Button of the site password form','Enter'],
  ['login_label','Label of the username field','Username'],
  ['login_button','Button of the username form','Continue'],
  ['join_prompt','Above the circles a writer can join','Join a circle to start writing:'],
  ['no_circle','When no circle can be joined','No circle is open to join yet. Check back soon.'],
  ['finished_heading','Heading of the concluded stories','Concluded stories'],
  ['finished_empty','When no circle is concluded yet','No concluded circles yet.']];
// Texts a writer sees inside a circle are stored on that circle (circles.texts).
const CIRCLE=[
  ['start','When asked to start a story','Start a new story. Write its first paragraph.'],
  ['continue','When asked to continue a story','Continue this story:'],
  ['waiting','When no turn is waiting','No turn is waiting for you. A new one arrives when the next day starts.'],
  ['submitted','After writing','Your paragraph is in. You can change it until the next day starts.'],
  ['so_far','Above the story, after writing','The story so far:'],
  ['next','Next hand-out ({time} is replaced; only shown with a daily time)','The next turns are handed out on {time}.'],
  ['label','Label of the text field','Your paragraph'],
  ['submit','Button to add a paragraph','Add to story'],
  ['save','Button to change a paragraph','Save changes']];
let site={};try{site=JSON.parse(localStorage.getItem('site'))||{}}catch{}
const txt=k=>site[k]||SITE.find(x=>x[0]===k)[2];
const ctxt=(c,k)=>(c&&c.texts&&c.texts[k])||CIRCLE.find(x=>x[0]===k)[2];
const applySite=()=>{document.title=txt('app_name');document.querySelectorAll('[data-t]').forEach(e=>e.textContent=txt(e.dataset.t))};
const field=([k,l,d],v,p='')=>`<label>${l}<input name="${p+k}" value="${esc(v||'')}" placeholder="${esc(d)}"></label>`;
applySite();

if(!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase)){
  document.querySelector('main').innerHTML='<p>Add your Supabase URL and anon key to config.js.</p>';
}else{
const mk=o=>supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,o);
// Two separate sessions: the site password (siteC) and the admin login (adminC), so admin sign-out keeps the site unlocked.
const siteC=mk(),adminC=mk({auth:{storageKey:'plotweave-admin'}});let sb=siteC;
let me=null,isAdmin=false,editing=false,max=500;const openRows=new Set(),openCfg=new Set();
const rpc=async(f,a)=>{const{data,error}=await sb.rpc(f,a);if(error)throw error;return data};
const show=(id,on)=>{$('#'+id).hidden=!on};
const act=async f=>{try{await f();await render()}catch(x){alert(x.message)}};
const byTime=(a,b)=>a.created_at<b.created_at?-1:1,T=x=>+new Date(x);

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
  $('#who').textContent=me?'Signed in as '+me:'';show('out',!!me);
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
    sb.from('circles').select('*,members(username),stories(id,starter,created_at,contributions(id,author,body,created_at,edited_at,edited_by))').order('created_at',{ascending:false}),
    sb.from('assignments').select('story_id,circle_id,username,done,active,missed,seen,assigned_at')]);
  if(a.error)throw a.error;if(b.error)throw b.error;
  $('#site').innerHTML=SITE.map(f=>field(f,site[f[0]])).join('')+'<p class="note">An empty field uses the text shown in grey.</p><button>Save site settings</button>';
  $('#circlelist').innerHTML=a.data.map(c=>{
    const asg=b.data.filter(x=>x.circle_id===c.id),mem=c.members.map(m=>m.username),pend=asg.filter(x=>x.active&&!x.done);
    const missed=(u,sid)=>asg.some(x=>x.missed&&x.username===u&&x.story_id===sid);
    // finished: no open turn, and every member has written or missed their turn to start a story and their turn in every story
    const full=c.stories.length>0&&!pend.length&&mem.every(u=>(c.stories.some(s=>s.starter===u)||missed(u,null))&&c.stories.every(s=>s.contributions.some(x=>x.author===u)||missed(u,s.id)));
    const rows=c.stories.map(s=>{
      const cons=s.contributions.sort(byTime),p=pend.find(x=>x.story_id===s.id),o=openRows.has(s.id);
      const ev=cons.map(x=>x.edited_at&&T(x.edited_at)>T(x.created_at)?{t:x.edited_at,by:x.edited_by||x.author}:{t:x.created_at,by:x.author}).sort((x,y)=>T(x.t)-T(y.t)).at(-1)||{t:s.created_at,by:s.starter};
      const skip=mem.filter(u=>missed(u,s.id)),left=mem.filter(u=>!cons.some(x=>x.author===u)&&!skip.includes(u));
      return `<tr><td>${esc(s.starter)}</td><td>${fmt(s.created_at)}</td><td>${cons.length}</td><td>${p?esc(p.username):'-'}</td><td>${left.map(esc).join(', ')||'nobody'}</td><td>${skip.map(esc).join(', ')||'-'}</td><td>${esc(ev.by)}</td><td>${fmt(ev.t)}</td><td><button class="link" data-toggle="${s.id}">${o?'Close':'Edit'}</button></td></tr>`
        +`<tr class="editrow" id="e-${s.id}"${o?'':' hidden'}><td colspan="9">`+cons.map(x=>`<div class="edit"><small>${esc(x.author)}</small><textarea maxlength="${c.max_chars}" data-id="${x.id}">${esc(x.body)}</textarea><button data-save="${x.id}">Save</button></div>`).join('')+'</td></tr>';
    }).join('');
    const starting=pend.filter(x=>!x.story_id).map(x=>esc(x.username));
    const news=asg.filter(x=>x.missed&&!x.seen).sort((x,y)=>T(x.assigned_at)-T(y.assigned_at));
    const notice=news.length?'<div class="notice"><strong>Missed turns</strong><ul>'+news.map(x=>{const s=c.stories.find(s=>s.id===x.story_id);
      return `<li>${esc(x.username)} did not ${s?'continue the story started by '+esc(s.starter):'start a story'} (turn handed out ${fmt(x.assigned_at)}). The circle moved on without it.</li>`}).join('')+`</ul><button class="link" data-seen="${c.id}">Mark as seen</button></div>`:'';
    const when=c.distribute_at?`daily at ${c.distribute_at.slice(0,5)} (${esc(c.tz)})`:'only when you press "Start next day"';
    const form=`<details data-cfg="${c.id}"${openCfg.has(c.id)?' open':''}><summary>Circle settings</summary><form class="fields" data-circle="${c.id}">`
      +`<label>Name<input name="name" required maxlength="60" value="${esc(c.name)}"></label>`
      +`<label>Description (shown to writers)<textarea name="description" rows="2" maxlength="500">${esc(c.description)}</textarea></label>`
      +`<label>Hand out turns daily at (empty: only by hand)<input name="distribute_at" type="time" value="${c.distribute_at?c.distribute_at.slice(0,5):''}"></label>`
      +`<label class="check"><input name="joinable" type="checkbox"${c.joinable?' checked':''}> New writers can join</label>`
      +`<label>Paragraphs a writer sees from the start of a story<input name="visible_first" type="number" min="0" max="50" required value="${c.visible_first}"></label>`
      +`<label>Paragraphs a writer sees from the end of a story<input name="visible_last" type="number" min="0" max="50" required value="${c.visible_last}"></label>`
      +`<label>Longest paragraph (characters)<input name="max_chars" type="number" min="50" max="5000" required value="${c.max_chars}"></label>`
      +'<h4>Texts writers see in this circle</h4>'+CIRCLE.map(f=>field(f,c.texts&&c.texts[f[0]],'t_')).join('')
      +`<p class="note">An empty text field uses the text shown in grey. The daily time is in your time zone (${esc(TZ)}).</p><button>Save circle settings</button></form></details>`;
    return `<article><h3>${esc(c.name)}${c.concluded?' (concluded)':''}</h3>${notice}<p class="note">Members: ${mem.map(esc).join(', ')||'none yet'}${starting.length?'. Asked to start a story: '+starting.join(', '):''}</p>`
      +(c.concluded?'':`<p class="note">Turns are handed out ${when}. Last time: ${fmt(c.last_distributed_at)}.</p>`)
      +(rows?`<div class="tablewrap"><table><tr><th>Created by</th><th>Created</th><th>Paragraphs</th><th>Turn now</th><th>Still to write</th><th>Missed</th><th>Last edited by</th><th>Last updated</th><th></th></tr>${rows}</table></div>`:'<p class="note">No stories yet.</p>')
      +'<p>'+(!c.concluded?`<button data-newday="${c.id}">Start next day</button> `:'')+(!c.concluded&&full?`<button data-conclude="${c.id}">Conclude circle</button> `:'')+`<button class="link" data-del="${c.id}">Delete circle</button></p>${form}</article>`;
  }).join('')||'<p>No circles yet. Create one above.</p>';
}

async function renderFinished(){
  const{data}=await sb.from('circles').select('name,stories(contributions(author,body,created_at))').eq('concluded',true).order('created_at',{ascending:false});
  $('#done').innerHTML=(data||[]).map(c=>`<h3>${esc(c.name)}</h3>`+c.stories.map(s=>'<article>'+s.contributions.sort(byTime).map(x=>`<p>${esc(x.body)} <small>${esc(x.author)}</small></p>`).join('')+'</article>').join('')).join('')||`<p>${esc(txt('finished_empty'))}</p>`;
}

$('#gate').onsubmit=async e=>{e.preventDefault();
  const{error}=await siteC.auth.signInWithPassword({email:SHARED,password:$('#sitepw').value});
  if(error)return alert('Wrong password.');$('#sitepw').value='';render()};
$('#id').oninput=e=>{const on=e.target.value.trim().toLowerCase()===ADMIN;show('adminrow',on);$('#adminpw').required=on};
$('#login').onsubmit=async e=>{e.preventDefault();const n=$('#id').value.trim().toLowerCase();
  if(n===ADMIN){
    const{error}=await adminC.auth.signInWithPassword({email:ADMIN_EMAIL,password:$('#adminpw').value});
    if(error)return alert('Wrong admin password.');$('#adminpw').value='';
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
$('#admin').addEventListener('submit',e=>{const id=e.target.dataset.circle;if(!id)return;e.preventDefault();
  const v=Object.fromEntries(new FormData(e.target)),texts={};
  CIRCLE.forEach(([k])=>{const t=v['t_'+k].trim();if(t)texts[k]=t});
  act(async()=>{const{error}=await sb.from('circles').update({name:v.name.trim(),description:v.description.trim(),joinable:'joinable' in v,distribute_at:v.distribute_at||null,tz:TZ,
    visible_first:+v.visible_first,visible_last:+v.visible_last,max_chars:+v.max_chars,texts}).eq('id',id);if(error)throw error})});
$('#admin').addEventListener('toggle',e=>{const id=e.target.dataset.cfg;if(id)e.target.open?openCfg.add(id):openCfg.delete(id)},true);
$('#admin').onclick=e=>{const d=e.target.dataset;
  if(d.toggle){const r=$('#e-'+d.toggle);r.hidden=!r.hidden;r.hidden?openRows.delete(d.toggle):openRows.add(d.toggle);e.target.textContent=r.hidden?'Edit':'Close'}
  if(d.save)act(async()=>{const{error}=await sb.from('contributions').update({body:document.querySelector(`textarea[data-id="${d.save}"]`).value.trim(),edited_at:new Date().toISOString(),edited_by:ADMIN}).eq('id',d.save);if(error)throw error});
  if(d.seen)act(async()=>{const{error}=await sb.from('assignments').update({seen:true}).eq('circle_id',d.seen).eq('missed',true);if(error)throw error});
  if(d.conclude)act(()=>rpc('conclude_circle',{p_circle:d.conclude}));
  if(d.newday&&confirm('Start the next day for this circle? Turns nobody has answered yet are skipped for good, and nobody can edit yesterday\'s paragraph anymore.'))act(async()=>{alert(await rpc('run_new_day',{p_circle:d.newday})+' turns handed out.')});
  if(d.del&&confirm('Delete this circle with all its members, stories and paragraphs? This cannot be undone.'))act(async()=>{const{error}=await sb.from('circles').delete().eq('id',d.del);if(error)throw error})};
loadSite().then(render).catch(x=>alert(x.message));
}
