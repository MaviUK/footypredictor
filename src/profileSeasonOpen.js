let seasonOpenBusy = false

function addSeasonOpenCss() {
  if (document.getElementById('profile-season-open-css')) return
  const style = document.createElement('style')
  style.id = 'profile-season-open-css'
  style.textContent = `
    .profile-history-row:not(.profile-history-head){cursor:pointer}
    .profile-history-row:not(.profile-history-head):hover{outline:2px solid #74f58e}
    #profile-season-detail[hidden]{display:none}
    body.profile-season-open .profile-stack{display:none!important}
    .season-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}
    .season-detail-head h2{margin:.1rem 0;font-size:clamp(2rem,7vw,4rem);line-height:.95;letter-spacing:-.06em}
    .season-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}
    .season-detail-card{border-radius:16px;background:#183823;padding:12px;text-align:center}
    .season-detail-card span{display:block;color:#a9d9b6;font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
    .season-detail-card strong{display:block;margin-top:5px;font-size:1.15rem}
    .season-detail-section{border:1px solid #28583b;border-radius:18px;background:#0c2416;padding:12px;margin-top:10px}
    .season-detail-section h3{margin:.1rem 0 .7rem;color:#74f58e}
    .season-detail-table{display:grid;gap:5px;overflow-x:auto}
    .season-detail-row{display:grid;grid-template-columns:34px minmax(130px,1fr) 52px 52px 52px 92px;gap:5px;align-items:center;min-width:520px;border-radius:10px;background:#eaf8ee;color:#06110c;padding:7px}
    .season-fixture-row{display:grid;grid-template-columns:42px minmax(180px,1fr) 58px 58px 50px;gap:5px;align-items:center;min-width:500px;border-radius:10px;background:#eaf8ee;color:#06110c;padding:7px}
    .season-detail-row span,.season-detail-row strong,.season-fixture-row span,.season-fixture-row strong{color:#06110c;font-size:.72rem;font-weight:900;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .season-detail-row strong,.season-fixture-row strong{text-align:left}
    .season-head-row{background:#dff4e5;text-transform:uppercase}
    .season-detail-row.promoted{box-shadow:inset 5px 0 0 #74f58e}.season-detail-row.relegated{box-shadow:inset 5px 0 0 #ff2f45}.season-detail-row.champion{box-shadow:inset 5px 0 0 #fff7a8}
    @media(max-width:760px){.season-detail-head{display:grid}.season-detail-grid{grid-template-columns:1fr}.season-detail-row span,.season-detail-row strong,.season-fixture-row span,.season-fixture-row strong{font-size:.62rem}}
  `
  document.head.appendChild(style)
}

function esc(value){return String(value??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

async function getSessionInfo(){const mod=await import('./supabaseClient.js');const {data}=await mod.supabase.auth.getSession();return{token:data?.session?.access_token||'',userId:data?.session?.user?.id||''}}
async function getArchive(token,query=''){const res=await fetch(`/.netlify/functions/getSeasonArchive${query}`,{headers:{Authorization:`Bearer ${token}`}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not load season');return data}

function findUserSeasons(data,userId){const list=[];(data.seasons||[]).forEach((season)=>{(season.tiers||[]).forEach((tier)=>{const row=(tier.rows||[]).find((item)=>item.userId===userId);if(row)list.push({season,tier,row})})});return list}

function tableHtml(tier){return `<div class="season-detail-table"><div class="season-detail-row season-head-row"><span>#</span><strong>Club</strong><span>Pts</span><span>Exact</span><span>Result</span><span>Status</span></div>${(tier.rows||[]).map((r)=>`<div class="season-detail-row ${esc(r.statusClass)}"><span>${esc(r.rank)}</span><strong>${esc(r.clubName)}</strong><span>${esc(r.totalPoints)}</span><span>${esc(r.exactScores)}</span><span>${esc(r.correctResults)}</span><span>${esc(r.status)}</span></div>`).join('')}</div>`}
function fixturesHtml(fixtures){if(!fixtures?.length)return '<p class="muted">No fixture predictions found.</p>';return `<div class="season-detail-table"><div class="season-fixture-row season-head-row"><span>Rnd</span><strong>Fixture</strong><span>Actual</span><span>Pick</span><span>Pts</span></div>${fixtures.map((f)=>`<div class="season-fixture-row"><span>${esc(f.roundNumber)}</span><strong>${esc(f.homeTeam)} v ${esc(f.awayTeam)}</strong><span>${esc(f.actualScore)}</span><span>${esc(f.predictedScore)}</span><span>${esc(f.points)}</span></div>`).join('')}</div>`}

function panel(){let p=document.getElementById('profile-season-detail');const topbar=document.querySelector('.topbar');if(!p&&topbar){p=document.createElement('section');p.id='profile-season-detail';p.hidden=true;topbar.insertAdjacentElement('afterend',p)}return p}

async function openSeason(index){if(seasonOpenBusy)return;seasonOpenBusy=true;addSeasonOpenCss();const p=panel();if(!p){seasonOpenBusy=false;return}try{p.hidden=false;document.body.classList.add('profile-season-open');p.innerHTML='<section class="panel"><p class="eyebrow">Season history</p><h2>Loading season...</h2></section>';const {token,userId}=await getSessionInfo();if(!token||!userId)throw new Error('Please sign in first');const archive=await getArchive(token);const match=findUserSeasons(archive,userId)[index];if(!match)throw new Error('That season is not archived yet');const detail=await getArchive(token,`?dailyGameId=${encodeURIComponent(match.season.id)}&userId=${encodeURIComponent(userId)}`);p.innerHTML=`<section class="panel"><div class="season-detail-head"><div><p class="eyebrow">Season detail</p><h2>Season ${index+1}</h2><p class="muted">${esc(match.season.leagueName)} · ${esc(match.tier.name)}</p></div><button type="button" id="close-season-detail">Back to profile</button></div><div class="season-detail-grid"><div class="season-detail-card"><span>Position</span><strong>${esc(match.row.rank)} / ${(match.tier.rows||[]).length}</strong></div><div class="season-detail-card"><span>Points</span><strong>${esc(match.row.totalPoints)}</strong></div><div class="season-detail-card"><span>Status</span><strong>${esc(match.row.status)}</strong></div></div><section class="season-detail-section"><h3>Final table</h3>${tableHtml(match.tier)}</section><section class="season-detail-section"><h3>Your fixtures</h3>${fixturesHtml(detail.teamFixtures||[])}</section></section>`;p.querySelector('#close-season-detail')?.addEventListener('click',()=>{document.body.classList.remove('profile-season-open');p.hidden=true})}catch(e){p.innerHTML=`<section class="panel"><p class="eyebrow">Season history</p><h2>Could not open season</h2><p class="alert">${esc(e.message)}</p><button type="button" id="close-season-detail">Back to profile</button></section>`;p.querySelector('#close-season-detail')?.addEventListener('click',()=>{document.body.classList.remove('profile-season-open');p.hidden=true})}finally{seasonOpenBusy=false}}

function bindRows(){try{addSeasonOpenCss();const panels=[...document.querySelectorAll('.compact-history-panel,.daily-table-panel')];const history=panels.find((p)=>(p.querySelector('.eyebrow')?.textContent||'').trim().toLowerCase()==='season history');if(!history)return;[...history.querySelectorAll('.profile-history-row')].filter((r)=>!r.classList.contains('profile-history-head')).forEach((row,index)=>{if(row.dataset.seasonOpen==='yes')return;row.dataset.seasonOpen='yes';row.title='Tap to view this season';row.addEventListener('click',()=>openSeason(index))})}catch(e){console.warn('Season row binding skipped',e)}}

if(typeof window!=='undefined'&&typeof document!=='undefined'){window.addEventListener('load',bindRows);window.setInterval(bindRows,1200)}
