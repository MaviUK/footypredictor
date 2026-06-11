const monthMap = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

function seasonFromFixtureDate(text) {
  const match = String(text || '').toLowerCase().match(/(\d{1,2})\s+([a-z]{3})\s+(\d{4})/)
  if (!match) return ''

  const month = monthMap[match[2]]
  const year = Number(match[3])
  if (!Number.isFinite(year) || month === undefined) return ''

  const start = month >= 6 ? year : year - 1
  return `${start}/${start + 1}`
}

function fixSeasonLabel() {
  try {
    const seasonLabel = document.querySelector('.round-meta strong')
    const fixtureDate = document.querySelector('.fixture-date')
    if (!seasonLabel || !fixtureDate) return

    const current = String(seasonLabel.textContent || '').trim()
    const derived = seasonFromFixtureDate(fixtureDate.textContent)
    if (!derived) return

    const currentYears = current.match(/(\d{4})\/(\d{4})/)
    if (!currentYears) return

    const currentStart = Number(currentYears[1])
    const derivedStart = Number(derived.slice(0, 4))
    const impossibleGap = Math.abs(currentStart - derivedStart) > 5

    if (impossibleGap) {
      seasonLabel.textContent = derived
    }
  } catch (error) {
    console.warn('Season label fix skipped', error)
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', fixSeasonLabel)
  window.setInterval(fixSeasonLabel, 1000)
}
