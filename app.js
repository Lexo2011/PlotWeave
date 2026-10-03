const cfg=window.CONFIG||{},$=s=>document.querySelector(s);
const APP=cfg.APP_NAME||'Plot Weave',ADMIN=(cfg.ADMIN_USERNAME||'admin').toLowerCase();
const ADMIN_EMAIL=cfg.ADMIN_EMAIL||'admin@example.com',SHARED=cfg.SHARED_EMAIL||'shared@example.com';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=d=>d?new Date(d).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'-';
document.title=APP;document.querySelectorAll('.app-name').forEach(e=>e.textContent=APP);

if(!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase)){
  document.querySelector('main').innerHTML='<p>Add your Supabase URL and anon key to config.js.</p>';
}else{
const sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
let me=null,isAdmin=false;
const rpc=async(f,a)=>{const{data,error}=await sb.rpc(f,a);if(error)throw error;return data};
const show=(id,on)=>{$('#'+id).hidden=!on};
const act=async f=>{try{await f();await render()}catch(x){alert(x.message)}};
const byTime=(a,b)=>a.created_at<b.created_at?-1:1;

async function render(){
  const{data}=await sb.auth.getSession(),ses=data.session;
  isAdmin=!!ses&&ses.user.email===ADMIN_EMAIL;
  me=ses?(isAdmin?ADMIN:localStorage.getItem('author')):null;
  if(me===ADMIN&&!isAdmin)me=null;
  show('gate',!ses);show('login',!!ses&&!me);show('app',!!me&&!isAdmin);show('admin',isAdmin);show('finished',!!ses);
  $('#who').textContent=me?'Signed in as '+me:'';show('out',!!me);
  if(me&&!isAdmin)await renderUser();
  if(isAdmin)await renderAdmin();
  if(ses)await renderFinished();
}

async function renderUser(){
  const s=await rpc('my_state',{p_user:me}),t=s.turn;
  $('#prompt').innerHTML=t?(t.story_id
    ?`<p>${esc(t.circle)}: a story with ${t.count} ${t.count==1?'paragraph':'paragraphs'} so far. The last one:</p><blockquote>${esc(t.last)}</blockquote>`
    :`<p>${esc(t.circle)}: start a new story. Write its first paragraph.</p>`)
    :'<p>No turn is waiting for you. A new one arrives when the admin starts the next day.</p>';
  show('form',!!t);
  $('#circles').innerHTML=(s.mine.length?`<p>Your circles: ${s.mine.map(esc).join(', ')}</p>`:'<p>You are not in a circle yet.</p>')
    +s.joinable.map(c=>`<button data-join="${c.id}">Join ${esc(c.name)}</button>`).join('');
}

async function renderAdmin(){
  const[a,b]=await Promise.all([
    sb.from('circles').select('id,name,concluded,created_at,members(username),stories(id,starter,created_at,contributions(id,author,body,created_at,edited_at))').order('created_at',{ascending:false}),
    sb.from('assignments').select('story_id,circle_id,username').eq('done',false)]);
  if(a.error)throw a.error;
  const open=[...document.querySelectorAll('#circlelist details[open]')].map(d=>d.dataset.sid),pend=b.data||[];
  $('#circlelist').innerHTML=a.data.map(c=>{
    const M=c.members.length,full=M>0&&c.stories.length>=M&&c.stories.every(s=>s.contributions.length>=M);
    const rows=c.stories.map(s=>{
      const cons=s.contributions.sort(byTime),p=pend.find(x=>x.story_id===s.id);
      const last=[s.created_at,...cons.flatMap(x=>[x.created_at,x.edited_at])].filter(Boolean).sort().at(-1);
      return `<details data-sid="${s.id}"${open.includes(s.id)?' open':''}><summary>Story by ${esc(s.starter)}: ${cons.length}/${M} paragraphs, ${p?'turn: '+esc(p.username):'no turn pending'}, last edit ${fmt(last)}</summary>`
        +cons.map(x=>`<div class="edit"><small>${esc(x.author)}</small><textarea maxlength="500" data-id="${x.id}">${esc(x.body)}</textarea><button data-save="${x.id}">Save</button></div>`).join('')+'</details>';
    }).join('');
    const starting=pend.filter(x=>x.circle_id===c.id&&!x.story_id).map(x=>esc(x.username));
    return `<article><h3>${esc(c.name)}${c.concluded?' (concluded)':''}</h3><p class="note">Members: ${c.members.map(m=>esc(m.username)).join(', ')||'none yet'}${starting.length?'. Asked to start a story: '+starting.join(', '):''}</p>${rows}${!c.concluded&&full?`<button data-conclude="${c.id}">Conclude circle</button>`:''}</article>`;
  }).join('')||'<p>No circles yet. Create one above.</p>';
}

async function renderFinished(){
  const{data}=await sb.from('circles').select('name,stories(contributions(author,body,created_at))').eq('concluded',true).order('created_at',{ascending:false});
  $('#done').innerHTML=(data||[]).map(c=>`<h3>${esc(c.name)}</h3>`+c.stories.map(s=>'<article>'+s.contributions.sort(byTime).map(x=>`<p>${esc(x.body)} <small>${esc(x.author)}</small></p>`).join('')+'</article>').join('')).join('')||'<p>No concluded circles yet.</p>';
}

$('#gate').onsubmit=async e=>{e.preventDefault();
  const{error}=await sb.auth.signInWithPassword({email:SHARED,password:$('#sitepw').value});
  if(error)return alert('Wrong password.');$('#sitepw').value='';render()};
$('#id').oninput=e=>{const on=e.target.value.trim().toLowerCase()===ADMIN;show('adminrow',on);$('#adminpw').required=on};
$('#login').onsubmit=async e=>{e.preventDefault();const n=$('#id').value.trim().toLowerCase();
  if(n===ADMIN){
    const{error}=await sb.auth.signInWithPassword({email:ADMIN_EMAIL,password:$('#adminpw').value});
    if(error)return alert('Wrong admin password.');$('#adminpw').value='';
  }else localStorage.setItem('author',n);
  render()};
$('#out').onclick=async()=>{localStorage.removeItem('author');if(isAdmin)await sb.auth.signOut();render()};
$('#circles').onclick=e=>{const id=e.target.dataset.join;if(id)act(()=>rpc('join_circle',{p_user:me,p_circle:id}))};
$('#text').oninput=e=>$('#count').textContent=e.target.value.length+'/500';
$('#form').onsubmit=e=>{e.preventDefault();act(async()=>{await rpc('submit_turn',{p_user:me,p_body:$('#text').value});$('#text').value='';$('#count').textContent='0/500'})};
$('#newcircle').onsubmit=e=>{e.preventDefault();act(async()=>{const{error}=await sb.from('circles').insert({name:$('#cname').value.trim()});if(error)throw error;$('#cname').value=''})};
$('#newday').onclick=()=>{if(confirm('Start the next day? Turns nobody has answered yet are handed out again.'))act(async()=>{alert(await rpc('run_new_day')+' turns handed out.')})};
$('#admin').onclick=e=>{const d=e.target.dataset;
  if(d.save)act(async()=>{const{error}=await sb.from('contributions').update({body:document.querySelector(`textarea[data-id="${d.save}"]`).value.trim(),edited_at:new Date().toISOString()}).eq('id',d.save);if(error)throw error});
  if(d.conclude)act(()=>rpc('conclude_circle',{p_circle:d.conclude}))};
render();
}
