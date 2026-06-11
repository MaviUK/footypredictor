let reviewLoading = false

function addReviewStyles() {
  if (!document.head || document.getElementById('last-season-review-css')) return
  const style = document.createElement('style')
  style.id = 'last-season-review-css'
  style.textContent = `
    #last-season-review-panel[hidden] { display: none; }
    #last-season-review-panel { margin-bottom: 12px; }
    body.last-season-review-open .app-shell > .hero,
    body.last-season-review-open .app-shell > .country-badge,
    body.last-season-review-open .app-shell > #season-finish-timer,
    body.last-season-review-open .app-shell > .user-results,
    body.last-season-review-open .app-shell > .game-layout,
    body.last-season-review-open .app-shell > .daily-table-panel,
    body.last-season-review-open .app-shell > .result-notice,
    body.last-season-review-open .app-shell > .panel:not(#last-season-review-card) { display:none !important; }
    .last-review-card { min-height: calc(100vh - 150px); }
    .last-review-head { text-align:center; margin-bottom:14px; }
    .last-review-head h2 { margin:.1rem 0; font-size:clamp(2rem,8vw,4.6rem); line-height:.92; letter-spacing:-.065em; }
    .last-review-sub { color:#cdebd5; font-weight:800; }
    .last-review-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:12px 0; }
    .last-review-stat { border-radius:18px; background:#183823; padding:13px; text-align:center; }
    .last-review-stat span { display:block; color:#a9d9b6; font-size:.68rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }
    .last-review-stat strong { display:block; margin-top:5px; font-size:1.25rem; }
    .last-review-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .last-review-section { border:1px solid #28583b; border-radius:18px; background:#0c2416; padding:12px; }
    .last-review-section h3 { margin:.1rem 0 .7rem; color:#74f58e; }
    .last-review-list { display:grid; gap:6px; }
    .last-review-club { display:flex; justify-content:space-between; gap:10px; align-items:center; border-radius:12px; background:#eaf8ee; color:#06110c; padding:8px 10px; font-weight:900; }
    .last-review-club span,.last-review-club strong { color:#06110c; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .last-review-empty { color:#cdebd5; font-weight:800; }
    .last-review-actions { display:flex; justify-content:center; margin-top:14px; }
    .last-review-actions button { min-width:min(420px,100%); }
    @media(max-width:760px){.last-review-grid,.last-review-columns{grid-template-columns:1fr}.last-review-card{min-height:calc(100vh - 120px)}}
  `
  document.head.appendChild(style)
}

function html(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

function clubList(rows) {
  if (!rows || !rows.length) return '<p class="last-review-empty">None</p>'
  return `<div class="last-review-list">${rows.map((row) => `
    <div class="last-review-club"><strong>${html(row.clubName)}</strong><span>${html(row.status || '')}</span></div>
  `).join('')}</div>`
}

function findMyLastSeason(payload, userId) {
  const seasons = payload?.seasons || []
  for (const season of seasons) {
    for (const tier of season.tiers || []) {
      const myRow = (tier.rows || []).find((row) => row.userId === userId)
      if (myRow) return { season, tier, myRow }
    }
  }
  return null
}

function reviewSeenKey(userId, seasonId) {
  return `lastSeasonReviewSeen:${userId}:${seasonId}`
}

function getIncoming(season, level) {
  const fromBelow = (season.tiers || []).find((tier) => Number(tier.level) === Number(level) + 1)
  const fromAbove = (season.tiers || []).find((tier) => Number(tier.level) === Number(level) - 1)
  return {
    comingUp: fromBelow?.promoted || [],
    comingDown: fromAbove?.relegated || [],
  }
}

function renderReview(match, userId) {
  const { season, tier, myRow } = match
  const incoming = getIncoming(season, tier.level)
  const seenKey = reviewSeenKey(userId, season.id)

  return `
    <section class="panel last-review-card" id="last-season-review-card">
      <div class="last-review-head">
        <p class="eyebrow">Last season review</p>
        <h2>${html(tier.name)}</h2>
        <p class="last-review-sub">${html(season.country)} · ${html(season.leagueName)} · ${html(season.seasonLabel)} · ${html(season.gameDate)}</p>
      </div>
      <div class="last-review-grid">
        <div class="last-review-stat"><span>Your position</span><strong>${html(myRow.rank)} / ${(tier.rows || []).length}</strong></div>
        <div class="last-review-stat"><span>Your points</span><strong>${html(myRow.totalPoints)}</strong></div>
        <div class="last-review-stat"><span>Your status</span><strong>${html(myRow.status)}</strong></div>
      </div>
      <div class="last-review-grid">
        <div class="last-review-stat"><span>Champion</span><strong>${html(tier.champion?.clubName || '-')}</strong></div>
        <div class="last-review-stat"><span>Promoted</span><strong>${html((tier.promoted || []).length)} clubs</strong></div>
        <div class="last-review-stat"><span>Relegated</span><strong>${html((tier.relegated || []).length)} clubs</strong></div>
      </div>
      <div class="last-review-columns">
        <div class="last-review-section"><h3>Promoted out of this league</h3>${clubList(tier.promoted)}</div>
        <div class="last-review-section"><h3>Relegated out of this league</h3>${clubList(tier.relegated)}</div>
        <div class="last-review-section"><h3>Coming up into this league</h3>${clubList(incoming.comingUp)}</div>
        <div class="last-review-section"><h3>Coming down into this league</h3>${clubList(incoming.comingDown)}</div>
      </div>
      <div class="last-review-actions"><button type="button" id="continue-after-review" data-seen-key="${html(seenKey)}">Continue to today's game</button></div>
    </section>
  `
}

async function showLastSeasonReview() {
  if (reviewLoading || document.body.classList.contains('archive-view')) return
  const nav = document.querySelector('.topbar')
  if (!nav || document.getElementById('last-season-review-card')) return

  reviewLoading = true
  try {
    addReviewStyles()

    const { supabase } = await import('./supabaseClient.js')
    const { data } = await supabase.auth.getSession()
    const session = data?.session
    if (!session?.access_token || !session.user?.id) return

    const res = await fetch('/.netlify/functions/getSeasonArchive', { headers: { Authorization: `Bearer ${session.access_token}` } })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) return

    const match = findMyLastSeason(payload, session.user.id)
    if (!match) return

    const seenKey = reviewSeenKey(session.user.id, match.season.id)
    if (window.localStorage.getItem(seenKey) === 'yes') return

    let panel = document.getElementById('last-season-review-panel')
    if (!panel) {
      panel = document.createElement('section')
      panel.id = 'last-season-review-panel'
      nav.insertAdjacentElement('afterend', panel)
    }

    panel.hidden = false
    panel.innerHTML = renderReview(match, session.user.id)
    document.body.classList.add('last-season-review-open')

    panel.querySelector('#continue-after-review')?.addEventListener('click', (event) => {
      const key = event.currentTarget.dataset.seenKey
      if (key) window.localStorage.setItem(key, 'yes')
      document.body.classList.remove('last-season-review-open')
      panel.hidden = true
    })
  } catch (error) {
    console.warn('Last season review skipped', error)
  } finally {
    reviewLoading = false
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', showLastSeasonReview)
  window.setInterval(showLastSeasonReview, 2500)
}
