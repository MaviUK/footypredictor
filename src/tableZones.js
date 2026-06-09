function addZoneStyles() {
  if (!document.head || document.getElementById('table-zone-styles')) return
  const style = document.createElement('style')
  style.id = 'table-zone-styles'
  style.textContent = `
    .daily-table-button.promotion-zone {
      background: linear-gradient(90deg, rgba(5,201,91,.42), #174224) !important;
      box-shadow: inset 5px 0 0 #74f58e;
    }
    .daily-table-button.relegation-zone {
      background: linear-gradient(90deg, rgba(255,47,69,.44), #174224) !important;
      box-shadow: inset 5px 0 0 #ff2f45;
    }
    .zone-marker {
      display: inline-grid;
      place-items: center;
      justify-self: end;
      min-width: 72px;
      border-radius: 999px;
      padding: 3px 7px;
      font-size: .58rem;
      font-weight: 1000;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #06110c !important;
    }
    .zone-marker.promotion { background: #74f58e; }
    .zone-marker.relegation { background: #ff8e96; }
    @media (max-width: 520px) {
      .zone-marker { min-width: 54px; padding: 2px 5px; font-size: .48rem; }
    }
  `
  document.head.appendChild(style)
}

function setZone(row, type, label) {
  row.classList.add(`${type}-zone`)
  let marker = row.querySelector('.zone-marker')
  if (!marker) {
    marker = document.createElement('small')
    marker.className = 'zone-marker'
    row.appendChild(marker)
  }
  marker.className = `zone-marker ${type}`
  marker.textContent = label
}

function updateTableZones() {
  try {
    const panels = document.querySelectorAll('.daily-table-panel')
    if (!panels.length) return

    addZoneStyles()

    panels.forEach((panel) => {
      const title = (panel.querySelector('.eyebrow')?.textContent || '').toLowerCase()
      const rows = Array.from(panel.querySelectorAll('.daily-table-button'))
      if (!rows.length || !title.includes('table')) return

      const isPremier = title.includes('premier league')
      const promotionCount = isPremier ? 0 : Math.min(4, rows.length)
      const relegationCount = Math.min(isPremier ? 3 : 4, Math.max(0, rows.length - promotionCount))

      rows.forEach((row, index) => {
        row.classList.remove('promotion-zone', 'relegation-zone')
        const marker = row.querySelector('.zone-marker')
        if (marker) marker.remove()

        if (index < promotionCount) setZone(row, 'promotion', 'Promote')
        if (index >= rows.length - relegationCount) setZone(row, 'relegation', 'Relegate')
      })
    })
  } catch (error) {
    console.warn('Table zones skipped', error)
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', updateTableZones)
  window.setInterval(updateTableZones, 1500)
}
