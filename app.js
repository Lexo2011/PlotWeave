const cfg=window.CONFIG||{},$=s=>document.querySelector(s);
const APP=cfg.APP_NAME||'Plot Weave',ADMIN=(cfg.ADMIN_USERNAME||'admin').toLowerCase();
const ADMIN_EMAIL=cfg.ADMIN_EMAIL||'admin@example.com',SHARED=cfg.SHARED_EMAIL||'shared@example.com';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=d=>d?new Date(d).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'-';
document.title=APP;document.querySelectorAll('.app-name').forEach(e=>e.textContent=APP);
if(cfg.APP_DESCRIPTION!==undefined)$('#tagline').textContent=cfg.APP_DESCRIPTION;

if(!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase)){
  document.querySelector('main').innerHTML='<p>Add your Supabase URL and anon key to config.js.</p>';
}else{
const mk=o=>supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,o);
// Two separate sessions: the site password (siteC) and the admin login (adminC), so admin sign-out keeps the site unlocked.
const siteC=mk(),adminC=mk({auth:{storageKey:'plotweave-admin'}});let sb=siteC;
let me=null,isAdmin=false,editing=false;const openRows=new Set();
const rpc=async(f,a)=>{const{data,error}=await sb.rpc(f,a);if(error)throw error;return data};
const show=(id,on)=>{$('#'+id).hidden=!on};
const act=async f=>{try{await f();await render()}catch(x){alert(x.message)}};
const byTime=(a,b)=>a.created_at<b.created_at?-1:1,T=x=>+new Date(x);

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
  const s=await rpc('my_state',{p_user:me}),t=s.turn;let h;
  editing=!!(t&&t.done);
  const ctx=t?t.parts.map((p,i)=>(i&&p.n!==t.parts[i-1].n+1?'<p class="note">…</p>':'')+`<blockquote>${esc(p.body)}</blockquote>`).join(''):'';
  if(!s.in_circle)h=s.joinable.length?'<p>Join a circle to start writing:</p>'+s.joinable.map(c=>`<button data-join="${c.id}">${esc(c.name)}</button>`).join(' '):'<p>No circle is open to join yet. Check back soon.</p>';
  else if(!t)h='<p>No turn is waiting for you. A new one arrives when the next day starts.</p>';
  else if(t.done)h=(ctx?'<p>The story so far:</p>'+ctx:'')+'<p>Your paragraph is in. You can change it until the next day starts.</p>';
  else if(!t.story_id)h='<p>Start a new story. Write its first paragraph.</p>';
  else h='<p>Continue this story:</p>'+ctx;
  $('#prompt').innerHTML=h;show('form',!!t);
  if(t){$('#text').value=t.done?t.own:'';$('#count').textContent=$('#text').value.length+'/500';$('#send').textContent=t.done?'Save changes':'Add to story'}
}

async function renderAdmin(){
  const[a,b,c]=await Promise.all([
    sb.from('circles').select('id,name,concluded,created_at,members(username),stories(id,starter,created_at,contributions(id,author,body,created_at,edited_at,edited_by))').order('created_at',{ascending:false}),
    sb.from('assignments').select('story_id,circle_id,username').eq('done',false),
    sb.from('settings').select('key,value')]);
  if(a.error)throw a.error;
  const st=Object.fromEntries((c.data||[]).map(x=>[x.key,x.value])),pend=b.data||[];
  $('#vfirst').value=st.visible_first??1;$('#vlast').value=st.visible_last??2;
  $('#circlelist').innerHTML=a.data.map(c=>{
    const M=c.members.length,full=M>0&&c.stories.length>=M&&c.stories.every(s=>s.contributions.length>=M);
    const rows=c.stories.map(s=>{
      const cons=s.contributions.sort(byTime),p=pend.find(x=>x.story_id===s.id),o=openRows.has(s.id);
      const ev=cons.map(x=>x.edited_at&&T(x.edited_at)>T(x.created_at)?{t:x.edited_at,by:x.edited_by||x.author}:{t:x.created_at,by:x.author}).sort((x,y)=>T(x.t)-T(y.t)).at(-1)||{t:s.created_at,by:s.starter};
      const left=c.members.map(m=>m.username).filter(u=>!cons.some(x=>x.author===u));
      return `<tr><td>${esc(s.starter)}</td><td>${fmt(s.created_at)}</td><td>${cons.length}/${M}</td><td>${p?esc(p.username):'-'}</td><td>${left.map(esc).join(', ')||'everyone'}</td><td>${esc(ev.by)}</td><td>${fmt(ev.t)}</td><td><button class="link" data-toggle="${s.id}">${o?'Close':'Edit'}</button></td></tr>`
        +`<tr class="editrow" id="e-${s.id}"${o?'':' hidden'}><td colspan="8">`+cons.map(x=>`<div class="edit"><small>${esc(x.author)}</small><textarea maxlength="500" data-id="${x.id}">${esc(x.body)}</textarea><button data-save="${x.id}">Save</button></div>`).join('')+'</td></tr>';
    }).join('');
    const starting=pend.filter(x=>x.circle_id===c.id&&!x.story_id).map(x=>esc(x.username));
    return `<article><h3>${esc(c.name)}${c.concluded?' (concluded)':''}</h3><p class="note">Members: ${c.members.map(m=>esc(m.username)).join(', ')||'none yet'}${starting.length?'. Asked to start a story: '+starting.join(', '):''}</p>`
      +(rows?`<div class="tablewrap"><table><tr><th>Created by</th><th>Created</th><th>Paragraphs</th><th>Turn now</th><th>Still to write</th><th>Last edited by</th><th>Last updated</th><th></th></tr>${rows}</table></div>`:'<p class="note">No stories yet.</p>')
      +'<p>'+(!c.concluded?`<button data-newday="${c.id}">Start next day</button> `:'')+(!c.concluded&&full?`<button data-conclude="${c.id}">Conclude circle</button> `:'')+`<button class="link" data-del="${c.id}">Delete circle</button></p></article>`;
  }).join('')||'<p>No circles yet. Create one above.</p>';
}

async function renderFinished(){
  const{data}=await sb.from('circles').select('name,stories(contributions(author,body,created_at))').eq('concluded',true).order('created_at',{ascending:false});
  $('#done').innerHTML=(data||[]).map(c=>`<h3>${esc(c.name)}</h3>`+c.stories.map(s=>'<article>'+s.contributions.sort(byTime).map(x=>`<p>${esc(x.body)} <small>${esc(x.author)}</small></p>`).join('')+'</article>').join('')).join('')||'<p>No concluded circles yet.</p>';
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
$('#text').oninput=e=>$('#count').textContent=e.target.value.length+'/500';
$('#form').onsubmit=e=>{e.preventDefault();act(()=>rpc(editing?'edit_turn':'submit_turn',{p_user:me,p_body:$('#text').value}))};
$('#newcircle').onsubmit=e=>{e.preventDefault();act(async()=>{const{error}=await sb.from('circles').insert({name:$('#cname').value.trim()});if(error)throw error;$('#cname').value=''})};
$('#vis').onsubmit=e=>{e.preventDefault();act(async()=>{const{error}=await sb.from('settings').upsert([{key:'visible_first',value:String(+$('#vfirst').value)},{key:'visible_last',value:String(+$('#vlast').value)}]);if(error)throw error})};
$('#admin').onclick=e=>{const d=e.target.dataset;
  if(d.toggle){const r=$('#e-'+d.toggle);r.hidden=!r.hidden;r.hidden?openRows.delete(d.toggle):openRows.add(d.toggle);e.target.textContent=r.hidden?'Edit':'Close'}
  if(d.save)act(async()=>{const{error}=await sb.from('contributions').update({body:document.querySelector(`textarea[data-id="${d.save}"]`).value.trim(),edited_at:new Date().toISOString(),edited_by:ADMIN}).eq('id',d.save);if(error)throw error});
  if(d.conclude)act(()=>rpc('conclude_circle',{p_circle:d.conclude}));
  if(d.newday&&confirm('Start the next day for this circle? Turns nobody has answered yet are handed out again, and nobody can edit yesterday\'s paragraph anymore.'))act(async()=>{alert(await rpc('run_new_day',{p_circle:d.newday})+' turns handed out.')});
  if(d.del&&confirm('Delete this circle with all its members, stories and paragraphs? This cannot be undone.'))act(async()=>{const{error}=await sb.from('circles').delete().eq('id',d.del);if(error)throw error})};
render();
}
