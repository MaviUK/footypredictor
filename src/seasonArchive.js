function archiveStyles() {
  if (!document.head || document.getElementById('season-archive-css')) return
  const style = document.createElement('style')
  style.id = 'season-archive-css'
  style.textContent = `
    #season-archive-panel { margin-bottom: 12px; }
    #season-archive-panel[hidden] { display: none; }
    .archive-head { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:10px; }
    .archive-season { border:1px solid #28583b; border-radius:18px; padding:12px; margin-top:10px; background:#0c2416; }
    .archive-season h3 { margin:.1rem 0 .3rem; font-size:1.25rem; }
    .archive-meta { color:#cdebd5; font-weight:800; font-size:.82rem; }
    .archive-tier { margin-top:12px; border-top:1px solid #28583b; padding-top:10px; }
    .archive-tier-title { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:8px; }
    .archive-tier-title strong { color:#74f58e; }
    .archive-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:8px; }
    .archive-summary-card { border-radius:14px; background:#183823; padding:9px; }
    .archive-summary-card span { display:block; color:#a9d9b6; font-size:.62rem; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
    .archive-summary-card strong { display:block; margin-top:4px; font-size:.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .archive-table { display:grid; gap:5px; overflow-x:auto; }
    .archive-row { display:grid; grid-template-columns:34px minmax(130px,1fr) 52px 52px 52px 96px; gap:5px; align-items:center; min-width:520px; border-radius:10px; background:#eaf8ee; color:#06110c; padding:7px; }
    .archive-row span,.archive-row strong { color:#06110c; font-size:.72rem; font-weight:900; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .archive-row strong { text-align:left; }
    .archive-row.archive-head-row { background:#dff4e5; text-transform:uppercase; }
    .archive-row.promoted { box-shadow: inset 5px 0 0 #74f58e; }
    .archive-row.relegated { box-shadow: inset 5px 0 0 #ff2f45; }
    .archive-row.champion { box-shadow: inset 5px 0 0 #fff7a8; }
    .archive-status { border-radius:999px; padding:3px 5px; background:#dff4e5; }
    .archive-status.promoted { background:#74f58e; }
    .archive-status.relegated { background:#ff8e96; }
    .archive-status.champion { background:#fff7a8; }
    @media(max-width:520px){.archive-head{display:grid}.archive-summary{grid-template-columns:1fr}.archive-row{grid-template-columns:28px minmax(110px,1fr) 42px 42px 42px 78px;min-width:390px}.archive-row span,.archive-row strong{font-size:.62rem}}
  `
  document.head.appendChild(style)
}

function html(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

function clubList(rows) {
  if (!rows || !rows.length) return '-'
  return rows.map((row) => row.clubName).slice(0, 4).join(', ')
}

function renderArchive(data) {
  const seasons = data?.seasons || []
  if (!seasons.length) return '<p class="muted">No previous closed seasons yet.</p>'

  return seasons.map((season) => `
    <article class="archive-season">
      <p class="eyebrow">${html(season.country)} · ${html(season.leagueName)}</p>
      <h3>${html(season.seasonLabel)}</h3>
      <p class="archive-meta">${html(season.gameDate)} · Previous season archive</p>
      ${(season.tiers || []).map((tier) => `
        <section class="archive-tier">
          <div class="archive-tier-title"><strong>${html(tier.name)}</strong><span>${(tier.rows || []).length} clubs</span></div>
          <div class="archive-summary">
            <div class="archive-summary-card"><span>Champion</span><strong>${html(tier.champion?.clubName || '-')}</strong></div>
            <div class="archive-summary-card"><span>Promoted</span><strong>${html(clubList(tier.promoted))}</strong></div>
            <div class="archive-summary-card"><span>Relegated</span><strong>${html(clubList(tier.relegated))}</strong></div>
          </div>
          <div class="archive-table">
            <div class="archive-row archive-head-row"><span>#</span><strong>Club</strong><span>Pts</span><span>Exact</span><span>Result</span><span>Status</span></div>
            ${(tier.rows || []).map((row) => `
              <div class="archive-row ${html(row.statusClass)}">
                <span>${html(row.rank)}</span>
                <strong>${html(row.clubName)}</strong>
                <span>${html(row.totalPoints)}</span>
                <span>${html(row.exactScores)}</span>
                <span>${html(row.correctResults)}</span>
                <span class="archive-status ${html(row.statusClass)}">${html(row.status)}</span>
              </div>
            `).join('')}
          </div>
        </section>
      `).join('')}
    </article>
  `).join('')
}

async function loadArchive(panel) {
  panel.hidden = false
  panel.innerHTML = '<section class="panel"><p class="eyebrow">Previous seasons</p><h2>Loading archive...</h2></section>'

  const { supabase } = await import('./supabaseClient.js')
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) {
    panel.innerHTML = '<section class="panel"><p class="eyebrow">Previous seasons</p><h2>Please sign in first.</h2></section>'
    return
  }

  const res = await fetch('/.netlify/functions/getSeasonArchive', { headers: { Authorization: `Bearer ${token}` } })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'Could not load archive')

  panel.innerHTML = `<section class="panel" id="season-archive-content"><div class="archive-head"><div><p class="eyebrow">Previous seasons archive</p><h2>Full final tables</h2><p class="muted">Includes the league/tier, champion, promoted clubs and relegated clubs.</p></div><button type="button" id="close-archive">Close</button></div>${renderArchive(payload)}</section>`
  panel.querySelector('#close-archive')?.addEventListener('click', () => { panel.hidden = true })
}

function installArchiveButton() {
  try {
    const nav = document.querySelector('.topbar-actions')
    if (!nav || document.getElementById('season-archive-button')) return

    archiveStyles()

    const button = document.createElement('button')
    button.id = 'season-archive-button'
    button.type = 'button'
    button.textContent = 'Archive'
    nav.insertBefore(button, nav.firstChild)

    let panel = document.getElementById('season-archive-panel')
    if (!panel) {
      panel = document.createElement('section')
      panel.id = 'season-archive-panel'
      panel.hidden = true
      const navParent = nav.closest('.topbar')
      navParent?.insertAdjacentElement('afterend', panel)
    }

    button.addEventListener('click', async () => {
      try {
        await loadArchive(panel)
      } catch (error) {
        panel.hidden = false
        panel.innerHTML = `<section class="panel"><p class="eyebrow">Previous seasons</p><h2>Archive error</h2><p class="alert">${html(error.message)}</p></section>`
      }
    })
  } catch (error) {
    console.warn('Archive UI skipped', error)
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', installArchiveButton)
  window.setInterval(installArchiveButton, 1500)
}
