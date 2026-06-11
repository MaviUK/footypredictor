let archivePayload = null
let archiveToken = ''
let archiveState = { leagueKey: '', seasonId: '', tierLevel: '', userId: '' }

function archiveStyles() {
  if (!document.head || document.getElementById('season-archive-css')) return
  const style = document.createElement('style')
  style.id = 'season-archive-css'
  style.textContent = `
    #season-archive-panel { margin-bottom: 12px; }
    #season-archive-panel[hidden] { display: none; }
    body.archive-view .app-shell > .hero,
    body.archive-view .app-shell > .country-badge,
    body.archive-view .app-shell > #season-finish-timer,
    body.archive-view .app-shell > .user-results,
    body.archive-view .app-shell > .game-layout,
    body.archive-view .app-shell > .daily-table-panel,
    body.archive-view .app-shell > .result-notice,
    body.archive-view .app-shell > .panel:not(#season-archive-content) { display:none !important; }
    .archive-page { min-height: calc(100vh - 150px); }
    .archive-head { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:14px; }
    .archive-head h2 { margin:.1rem 0; font-size:clamp(2rem,7vw,4rem); line-height:.95; letter-spacing:-.06em; }
    .archive-controls { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:12px; }
    .archive-controls label { color:#dff4e5; font-weight:900; }
    .archive-section { border:1px solid #28583b; border-radius:18px; padding:12px; margin-top:10px; background:#0c2416; }
    .archive-tier-title { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:8px; }
    .archive-tier-title strong { color:#74f58e; }
    .archive-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:8px; }
    .archive-summary-card { border-radius:14px; background:#183823; padding:9px; }
    .archive-summary-card span { display:block; color:#a9d9b6; font-size:.62rem; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
    .archive-summary-card strong { display:block; margin-top:4px; font-size:.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .archive-table,.archive-fixtures { display:grid; gap:5px; overflow-x:auto; }
    .archive-row { display:grid; grid-template-columns:34px minmax(130px,1fr) 52px 52px 52px 96px; gap:5px; align-items:center; min-width:520px; border-radius:10px; background:#eaf8ee; color:#06110c; padding:7px; }
    .archive-fixture-row { display:grid; grid-template-columns:42px minmax(180px,1fr) 58px 58px 58px 50px 54px; gap:5px; align-items:center; min-width:650px; border-radius:10px; background:#eaf8ee; color:#06110c; padding:7px; }
    .archive-row span,.archive-row strong,.archive-fixture-row span,.archive-fixture-row strong { color:#06110c; font-size:.72rem; font-weight:900; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .archive-row strong,.archive-fixture-row strong { text-align:left; }
    .archive-head-row { background:#dff4e5; text-transform:uppercase; }
    .archive-row.promoted { box-shadow: inset 5px 0 0 #74f58e; }
    .archive-row.relegated { box-shadow: inset 5px 0 0 #ff2f45; }
    .archive-row.champion { box-shadow: inset 5px 0 0 #fff7a8; }
    .archive-status { border-radius:999px; padding:3px 5px; background:#dff4e5; }
    .archive-status.promoted { background:#74f58e; }
    .archive-status.relegated { background:#ff8e96; }
    .archive-status.champion { background:#fff7a8; }
    .archive-empty { text-align:center; color:#cdebd5; font-weight:900; }
    @media(max-width:760px){.archive-controls{grid-template-columns:1fr 1fr}.archive-head{display:grid}.archive-summary{grid-template-columns:1fr}}
    @media(max-width:520px){.archive-controls{grid-template-columns:1fr}.archive-row{grid-template-columns:28px minmax(110px,1fr) 42px 42px 42px 78px;min-width:390px}.archive-fixture-row{grid-template-columns:34px minmax(140px,1fr) 48px 48px 48px 42px 48px;min-width:500px}.archive-row span,.archive-row strong,.archive-fixture-row span,.archive-fixture-row strong{font-size:.62rem}}
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

function findSelectedSeason() {
  return (archivePayload?.seasons || []).find((season) => season.id === archiveState.seasonId) || null
}

function findSelectedTier() {
  const season = findSelectedSeason()
  return (season?.tiers || []).find((tier) => String(tier.level) === String(archiveState.tierLevel)) || null
}

function selectedRows() {
  return findSelectedTier()?.rows || []
}

function normaliseState() {
  const leagues = archivePayload?.leagues || []
  const seasons = archivePayload?.seasons || []

  if (!archiveState.leagueKey && leagues[0]) archiveState.leagueKey = leagues[0].key

  const leagueSeasons = seasons.filter((season) => season.leagueKey === archiveState.leagueKey)
  if (!leagueSeasons.find((season) => season.id === archiveState.seasonId)) archiveState.seasonId = leagueSeasons[0]?.id || ''

  const season = findSelectedSeason()
  if (!season?.tiers?.find((tier) => String(tier.level) === String(archiveState.tierLevel))) archiveState.tierLevel = season?.tiers?.[0]?.level ? String(season.tiers[0].level) : ''

  const rows = selectedRows()
  if (!rows.find((row) => row.userId === archiveState.userId)) archiveState.userId = rows[0]?.userId || ''
}

function renderSelectOptions(items, valueKey, labelFn, selectedValue) {
  return items.map((item) => `<option value="${html(item[valueKey])}" ${String(item[valueKey]) === String(selectedValue) ? 'selected' : ''}>${html(labelFn(item))}</option>`).join('')
}

function renderSummary(tier) {
  if (!tier) return ''
  return `
    <div class="archive-summary">
      <div class="archive-summary-card"><span>Champion</span><strong>${html(tier.champion?.clubName || '-')}</strong></div>
      <div class="archive-summary-card"><span>Promoted</span><strong>${html(clubList(tier.promoted))}</strong></div>
      <div class="archive-summary-card"><span>Relegated</span><strong>${html(clubList(tier.relegated))}</strong></div>
    </div>
  `
}

function renderTable(tier) {
  if (!tier) return '<p class="archive-empty">Choose a tier to view the final table.</p>'
  return `
    <div class="archive-table">
      <div class="archive-row archive-head-row"><span>#</span><strong>Club</strong><span>Pts</span><span>Exact</span><span>Result</span><span>Status</span></div>
      ${(tier.rows || []).map((row) => `
        <button type="button" class="archive-row archive-club-row ${html(row.statusClass)}" data-user-id="${html(row.userId)}">
          <span>${html(row.rank)}</span>
          <strong>${html(row.clubName)}</strong>
          <span>${html(row.totalPoints)}</span>
          <span>${html(row.exactScores)}</span>
          <span>${html(row.correctResults)}</span>
          <span class="archive-status ${html(row.statusClass)}">${html(row.status)}</span>
        </button>
      `).join('')}
    </div>
  `
}

function renderFixtures(fixtures) {
  if (!archiveState.userId) return '<p class="archive-empty">Choose a club to view fixtures.</p>'
  if (!fixtures) return '<p class="archive-empty">Loading club fixtures...</p>'
  if (!fixtures.length) return '<p class="archive-empty">No fixture predictions found for this club.</p>'

  return `
    <div class="archive-fixtures">
      <div class="archive-fixture-row archive-head-row"><span>Rnd</span><strong>Fixture</strong><span>Actual</span><span>Pick</span><span>Result</span><span>Pts</span><span>Type</span></div>
      ${fixtures.map((round) => `
        <div class="archive-fixture-row">
          <span>${html(round.roundNumber)}</span>
          <strong>${html(round.homeTeam)} v ${html(round.awayTeam)}</strong>
          <span>${html(round.actualScore)}</span>
          <span>${html(round.predictedScore)}</span>
          <span>${html(round.resultCode)}</span>
          <span>${html(round.points)}</span>
          <span>${round.isAuto ? 'Auto' : 'User'}</span>
        </div>
      `).join('')}
    </div>
  `
}

function renderArchive(panel, fixtures) {
  normaliseState()

  const leagues = archivePayload?.leagues || []
  const seasons = archivePayload?.seasons || []
  const leagueSeasons = seasons.filter((season) => season.leagueKey === archiveState.leagueKey)
  const season = findSelectedSeason()
  const tier = findSelectedTier()
  const rows = selectedRows()
  const selectedClub = rows.find((row) => row.userId === archiveState.userId)

  if (!leagues.length) {
    panel.innerHTML = `<section class="panel archive-page" id="season-archive-content"><div class="archive-head"><div><p class="eyebrow">Archive</p><h2>Previous Seasons</h2><p class="muted">No previous closed seasons yet. The season you just completed only enters the archive when the daily closeout runs at 00:05 UK time.</p></div><button type="button" id="close-archive">Close</button></div></section>`
    bindArchiveEvents(panel)
    return
  }

  panel.innerHTML = `
    <section class="panel archive-page" id="season-archive-content">
      <div class="archive-head">
        <div><p class="eyebrow">Archive</p><h2>Previous Seasons</h2><p class="muted">Choose a league, season, tier and club to view the full final table and that club's fixture results.</p></div>
        <button type="button" id="close-archive">Close</button>
      </div>
      <div class="archive-controls">
        <label>League<select id="archive-league">${renderSelectOptions(leagues, 'key', (league) => `${league.country} - ${league.leagueName}`, archiveState.leagueKey)}</select></label>
        <label>Season<select id="archive-season">${renderSelectOptions(leagueSeasons, 'id', (item) => `${item.gameDate} - ${item.seasonLabel}`, archiveState.seasonId)}</select></label>
        <label>Tier<select id="archive-tier">${renderSelectOptions(season?.tiers || [], 'level', (item) => item.name, archiveState.tierLevel)}</select></label>
        <label>Club<select id="archive-club">${renderSelectOptions(rows, 'userId', (item) => `${item.rank}. ${item.clubName}`, archiveState.userId)}</select></label>
      </div>
      <section class="archive-section">
        <div class="archive-tier-title"><strong>${html(season?.leagueName || '')} · ${html(tier?.name || '')}</strong><span>${html(season?.seasonLabel || '')}</span></div>
        ${renderSummary(tier)}
        ${renderTable(tier)}
      </section>
      <section class="archive-section">
        <div class="archive-tier-title"><strong>${html(selectedClub?.clubName || 'Club fixtures')}</strong><span>Predictions and results</span></div>
        ${renderFixtures(fixtures)}
      </section>
    </section>
  `
  bindArchiveEvents(panel)
}

async function fetchArchive(query = '') {
  const res = await fetch(`/.netlify/functions/getSeasonArchive${query}`, { headers: { Authorization: `Bearer ${archiveToken}` } })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error || 'Could not load archive')
  return payload
}

async function loadFixtures(panel) {
  if (!archiveState.seasonId || !archiveState.userId) {
    renderArchive(panel, [])
    return
  }
  renderArchive(panel, null)
  const payload = await fetchArchive(`?dailyGameId=${encodeURIComponent(archiveState.seasonId)}&userId=${encodeURIComponent(archiveState.userId)}`)
  renderArchive(panel, payload.teamFixtures || [])
}

function bindArchiveEvents(panel) {
  panel.querySelector('#close-archive')?.addEventListener('click', () => {
    document.body.classList.remove('archive-view')
    panel.hidden = true
  })

  panel.querySelector('#archive-league')?.addEventListener('change', async (event) => {
    archiveState.leagueKey = event.target.value
    archiveState.seasonId = ''
    archiveState.tierLevel = ''
    archiveState.userId = ''
    await loadFixtures(panel)
  })

  panel.querySelector('#archive-season')?.addEventListener('change', async (event) => {
    archiveState.seasonId = event.target.value
    archiveState.tierLevel = ''
    archiveState.userId = ''
    await loadFixtures(panel)
  })

  panel.querySelector('#archive-tier')?.addEventListener('change', async (event) => {
    archiveState.tierLevel = event.target.value
    archiveState.userId = ''
    await loadFixtures(panel)
  })

  panel.querySelector('#archive-club')?.addEventListener('change', async (event) => {
    archiveState.userId = event.target.value
    await loadFixtures(panel)
  })

  panel.querySelectorAll('.archive-club-row').forEach((button) => {
    button.addEventListener('click', async () => {
      archiveState.userId = button.dataset.userId || ''
      await loadFixtures(panel)
    })
  })
}

async function openArchive(panel) {
  document.body.classList.add('archive-view')
  panel.hidden = false
  panel.innerHTML = '<section class="panel archive-page" id="season-archive-content"><p class="eyebrow">Archive</p><h2>Loading previous seasons...</h2></section>'

  const { supabase } = await import('./supabaseClient.js')
  const { data } = await supabase.auth.getSession()
  archiveToken = data?.session?.access_token || ''
  if (!archiveToken) {
    panel.innerHTML = '<section class="panel archive-page" id="season-archive-content"><p class="eyebrow">Archive</p><h2>Please sign in first.</h2></section>'
    return
  }

  archivePayload = await fetchArchive()
  archiveState = { leagueKey: '', seasonId: '', tierLevel: '', userId: '' }
  await loadFixtures(panel)
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
        await openArchive(panel)
      } catch (error) {
        document.body.classList.add('archive-view')
        panel.hidden = false
        panel.innerHTML = `<section class="panel archive-page" id="season-archive-content"><p class="eyebrow">Archive</p><h2>Archive error</h2><p class="alert">${html(error.message)}</p></section>`
      }
    })

    nav.querySelectorAll('button:not(#season-archive-button)').forEach((otherButton) => {
      otherButton.addEventListener('click', () => {
        document.body.classList.remove('archive-view')
        panel.hidden = true
      })
    })
  } catch (error) {
    console.warn('Archive UI skipped', error)
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', installArchiveButton)
  window.setInterval(installArchiveButton, 1500)
}
