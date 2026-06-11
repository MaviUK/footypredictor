function currentProfileLeagueLabel() {
  const profileText = document.querySelector('.club-profile-hero .muted')?.textContent || ''
  const parts = profileText.split('·').map((part) => part.trim()).filter(Boolean)
  return parts[2] || parts[1] || 'League'
}

function findSeasonHistoryRows() {
  const panels = Array.from(document.querySelectorAll('.compact-history-panel, .daily-table-panel'))
  const panel = panels.find((item) => (item.querySelector('.eyebrow')?.textContent || '').trim().toLowerCase() === 'season history')
  if (!panel) return []
  return Array.from(panel.querySelectorAll('.profile-history-row')).filter((row) => !row.classList.contains('profile-history-head'))
}

function maskBestWorstCards(rows, leagueLabel) {
  const summaries = Array.from(document.querySelectorAll('.season-summary'))
  if (!summaries.length || !rows.length) return

  const lookup = new Map()
  rows.forEach((row, index) => {
    const oldLabel = row.dataset.originalSeasonLabel
    if (!oldLabel) return
    lookup.set(oldLabel, `Season ${rows.length - index}`)
  })

  summaries.forEach((summary) => {
    const heading = summary.querySelector('h3')
    if (!heading) return
    if (!heading.dataset.originalSeasonLabel) heading.dataset.originalSeasonLabel = heading.textContent.trim()
    const seasonName = lookup.get(heading.dataset.originalSeasonLabel) || 'Season'
    heading.textContent = `${seasonName} · ${leagueLabel}`
  })
}

function maskProfileSeasonLabels() {
  try {
    const rows = findSeasonHistoryRows()
    if (!rows.length) return

    const leagueLabel = currentProfileLeagueLabel()
    const total = rows.length

    rows.forEach((row, index) => {
      const seasonCell = row.children?.[1]
      if (!seasonCell) return
      if (!row.dataset.originalSeasonLabel) row.dataset.originalSeasonLabel = seasonCell.textContent.trim()
      seasonCell.textContent = `Season ${total - index} · ${leagueLabel}`
      seasonCell.title = `${row.dataset.originalSeasonLabel} hidden to protect the mystery season`
    })

    maskBestWorstCards(rows, leagueLabel)
  } catch (error) {
    console.warn('Profile season label mask skipped', error)
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', maskProfileSeasonLabels)
  window.setInterval(maskProfileSeasonLabels, 1000)
}
