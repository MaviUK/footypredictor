let lastClickedSeasonRow = null

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char]))
}

function rowData(row) {
  const cells = Array.from(row?.children || []).map((cell) => cell.textContent.trim())
  return {
    position: cells[0] || '-',
    season: cells[1] || 'Season',
    played: cells[2] || '-',
    wins: cells[3] || '-',
    draws: cells[4] || '-',
    losses: cells[5] || '-',
    points: cells[6] || '-',
  }
}

function bindSeasonClickCapture() {
  document.addEventListener('click', (event) => {
    const row = event.target.closest?.('.profile-history-row:not(.profile-history-head)')
    if (!row) return
    lastClickedSeasonRow = rowData(row)
  }, true)
}

function renderFallback(panel, data) {
  const [seasonName, leagueName = 'League'] = String(data.season || 'Season').split('·').map((part) => part.trim())

  panel.hidden = false
  document.body.classList.add('profile-season-open')
  panel.innerHTML = `
    <section class="panel profile-season-detail">
      <div class="season-detail-head">
        <div>
          <p class="eyebrow">Season summary</p>
          <h2>${escapeHtml(seasonName || 'Season')}</h2>
          <p class="muted">${escapeHtml(leagueName)}</p>
        </div>
        <button type="button" id="close-basic-season-detail">Back to profile</button>
      </div>
      <div class="season-detail-grid">
        <div class="season-detail-card"><span>Position</span><strong>${escapeHtml(data.position)}</strong></div>
        <div class="season-detail-card"><span>Played</span><strong>${escapeHtml(data.played)}</strong></div>
        <div class="season-detail-card"><span>Points</span><strong>${escapeHtml(data.points)}</strong></div>
      </div>
      <div class="season-detail-grid">
        <div class="season-detail-card"><span>Wins</span><strong>${escapeHtml(data.wins)}</strong></div>
        <div class="season-detail-card"><span>Draws</span><strong>${escapeHtml(data.draws)}</strong></div>
        <div class="season-detail-card"><span>Losses</span><strong>${escapeHtml(data.losses)}</strong></div>
      </div>
      <section class="season-detail-section">
        <h3>Archive note</h3>
        <p class="muted">This season was saved before the full archive system existed, so fixture-by-fixture predictions and the final table are not available for it.</p>
        <p class="muted">Full season archive details will be available for seasons closed from now on.</p>
      </section>
    </section>
  `

  panel.querySelector('#close-basic-season-detail')?.addEventListener('click', () => {
    document.body.classList.remove('profile-season-open')
    panel.hidden = true
  })
}

function replaceNotArchivedError() {
  const panel = document.getElementById('profile-season-detail')
  if (!panel || panel.hidden) return

  const text = panel.textContent || ''
  if (!text.includes('That season is not archived yet')) return

  renderFallback(panel, lastClickedSeasonRow || {
    position: '-',
    season: 'Season',
    played: '-',
    wins: '-',
    draws: '-',
    losses: '-',
    points: '-',
  })
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', bindSeasonClickCapture)
  window.setInterval(replaceNotArchivedError, 400)
}
