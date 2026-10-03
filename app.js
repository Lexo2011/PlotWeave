const $=s=>document.querySelector(s),cfg=window.CONFIG||{};
const live=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Demo backend: everything lives in localStorage
const Demo={
  s:JSON.parse(localStorage.getItem('sr')||'null')||{day:0,name:null,turn:null,stories:[
    {id:1,done:false,parts:[{a:'Mara',t:'The lighthouse keeper found a door in the cliff that had not been there yesterday.'}]},
    {id:2,done:false,parts:[{a:'Joss',t:'Nobody in the village remembered who had ordered the enormous cake.'}]}]},
  save(){localStorage.setItem('sr',JSON.stringify(this.s))},
  async user(){return this.s.name},
  async signIn(n){this.s.name=n;this.save()},
  async signOut(){this.s.name=null;this.save()},
  async getTurn(){
    const s=this.s;
    if(!s.turn||s.turn.day!==s.day){
      const open=s.stories.filter(x=>!x.done&&!x.parts.some(p=>p.a===s.name));
      const pick=open[Math.floor(Math.random()*open.length)];
      s.turn={day:s.day,id:pick?pick.id:null,done:false};this.save();
    }
    const st=s.stories.find(x=>x.id===s.turn.id);
    return{done:s.turn.done,last:st&&st.parts.at(-1).t,count:st?st.parts.length:0};
  },
  async submit(t,fin){
    const s=this.s;let st=s.stories.find(x=>x.id===s.turn.id);
    if(!st){st={id:Date.now(),done:false,parts:[]};s.stories.push(st)}
    st.parts.push({a:s.name,t});
    if(fin||st.parts.length>=10)st.done=true;
    s.turn.done=true;this.save();
  },
  async finished(){return this.s.stories.filter(x=>x.done).map(x=>x.parts)},
  nextDay(){this.s.day++;this.save()}
};

// Live backend: Supabase (see setup.sql)
const sb=live?supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const Live={
  name:null,
  async user(){
    const{data}=await sb.auth.getSession();
    this.name=data.session?localStorage.getItem('author'):null;return this.name;
  },
  async signIn(name,pw){
    localStorage.setItem('author',name);
    const{error}=await sb.auth.signInWithPassword({email:cfg.SHARED_EMAIL||'shared@example.com',password:pw});
    if(error){localStorage.removeItem('author');throw new Error('Wrong password.')}
  },
  async signOut(){localStorage.removeItem('author');await sb.auth.signOut()},
  async getTurn(){
    const{data,error}=await sb.rpc('get_turn',{p_user:this.name});if(error)throw error;
    return{done:data.done,last:data.last,count:data.count||0};
  },
  async submit(t,fin){
    const{error}=await sb.rpc('submit_turn',{p_user:this.name,p_body:t,p_finish:fin});if(error)throw error;
  },
  async finished(){
    const{data}=await sb.from('stories').select('contributions(author,body,created_at)').eq('finished',true).order('created_at',{ascending:false}).limit(20);
    return(data||[]).map(s=>s.contributions.sort((a,b)=>a.created_at<b.created_at?-1:1).map(c=>({a:c.author,t:c.body})));
  }
};

const B=live?Live:Demo;
async function render(){
  const u=await B.user();
  $('#auth').hidden=!!u;$('#app').hidden=!u;
  $('#who').textContent=u?'Signed in as '+u:'';
  $('#mode').textContent=live?'':'Demo mode: stories stay in this browser. Add Supabase keys in config.js to go live (this also turns on the password).';
  $('#next').hidden=live;
  if(u){
    const t=await B.getTurn();
    $('#prompt').innerHTML=t.done?'<p>Your turn is done for today. Come back tomorrow for a new story.</p>'
      :t.last?`<p>Story with ${t.count} ${t.count===1?'turn':'turns'} so far. The last line:</p><blockquote>${esc(t.last)}</blockquote>`
      :'<p>No open stories right now. Start a new one.</p>';
    $('#form').hidden=t.done;
  }
  const f=await B.finished();
  $('#done').innerHTML=f.length?f.map(p=>'<article>'+p.map(x=>`<p>${esc(x.t)} <small>${esc(x.a)}</small></p>`).join('')+'</article>').join(''):'<p>Nothing finished yet. Stories close after 10 turns or when a writer ends them.</p>';
}
$('#pw').required=live;$('#pwrow').hidden=!live;
$('#login').onsubmit=async e=>{e.preventDefault();try{await B.signIn($('#id').value.trim().toLowerCase(),$('#pw').value);$('#pw').value='';render()}catch(x){alert(x.message)}};
$('#form').onsubmit=async e=>{e.preventDefault();try{await B.submit($('#text').value.trim(),$('#fin').checked);$('#text').value='';$('#fin').checked=false;$('#count').textContent='0/500';render()}catch(x){alert(x.message)}};
$('#out').onclick=async()=>{await B.signOut();render()};
$('#next').onclick=()=>{Demo.nextDay();render()};
$('#text').oninput=e=>$('#count').textContent=e.target.value.length+'/500';
if(live)sb.auth.onAuthStateChange(()=>render());
render();
