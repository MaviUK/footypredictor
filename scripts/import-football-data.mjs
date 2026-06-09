import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the importer')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const BASE_URL = 'https://www.football-data.co.uk/mmz4281'
const COMPETITION = 'E0'

function seasonCodes() {
  const codes = []
  for (let start = 1993; start <= 2025; start += 1) {
    const end = start + 1
    codes.push(`${String(start).slice(2)}${String(end).slice(2)}`)
  }
  return codes
}

function displayName(code) {
  return `20${code.slice(0, 2)}/20${code.slice(2)}`.replace('2093/2094', '1993/1994')
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }

  const [headers, ...data] = rows.filter((item) => item.some(Boolean))
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

function parseDate(value) {
  const parts = value.split('/').map(Number)
  if (parts.length !== 3) return null
  const [day, month, year] = parts
  const fullYear = year < 100 ? (year >= 90 ? 1900 + year : 2000 + year) : year
  return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function resultFor(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 'H'
  if (homeGoals < awayGoals) return 'A'
  return 'D'
}

function emptyTeam(name) {
  return {
    name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    form: [],
    homeForm: [],
    awayForm: [],
  }
}

function snapshot(table, team, venue) {
  const sorted = [...table.values()].sort((a, b) =>
    b.points - a.points ||
    (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name),
  )
  const row = table.get(team) || emptyTeam(team)
  return {
    position: sorted.findIndex((item) => item.name === team) + 1 || null,
    played: row.played,
    points: row.points,
    goalDifference: row.goalsFor - row.goalsAgainst,
    form: row.form.slice(-5).join(''),
    venueForm: (venue === 'home' ? row.homeForm : row.awayForm).slice(-5).join(''),
  }
}

function applyResult(table, match) {
  const home = table.get(match.home_team) || emptyTeam(match.home_team)
  const away = table.get(match.away_team) || emptyTeam(match.away_team)
  const homeGoals = match.full_time_home_goals
  const awayGoals = match.full_time_away_goals
  const homeResult = homeGoals > awayGoals ? 'W' : homeGoals === awayGoals ? 'D' : 'L'
  const awayResult = awayGoals > homeGoals ? 'W' : homeGoals === awayGoals ? 'D' : 'L'

  home.played += 1
  away.played += 1
  home.goalsFor += homeGoals
  home.goalsAgainst += awayGoals
  away.goalsFor += awayGoals
  away.goalsAgainst += homeGoals
  home.points += homeResult === 'W' ? 3 : homeResult === 'D' ? 1 : 0
  away.points += awayResult === 'W' ? 3 : awayResult === 'D' ? 1 : 0
  home.won += homeResult === 'W' ? 1 : 0
  home.drawn += homeResult === 'D' ? 1 : 0
  home.lost += homeResult === 'L' ? 1 : 0
  away.won += awayResult === 'W' ? 1 : 0
  away.drawn += awayResult === 'D' ? 1 : 0
  away.lost += awayResult === 'L' ? 1 : 0
  home.form.push(homeResult)
  away.form.push(awayResult)
  home.homeForm.push(homeResult)
  away.awayForm.push(awayResult)
  table.set(home.name, home)
  table.set(away.name, away)
}

async function importSeason(code) {
  const url = `${BASE_URL}/${code}/${COMPETITION}.csv`
  const response = await fetch(url)

  if (!response.ok) {
    console.log(`Skipping ${code}: ${response.status}`)
    return
  }

  const csv = await response.text()
  const rows = parseCsv(csv)
    .filter((row) => row.Date && row.HomeTeam && row.AwayTeam && row.FTHG !== '' && row.FTAG !== '')
    .map((row, index) => ({
      source_row: index + 1,
      match_date: parseDate(row.Date),
      home_team: row.HomeTeam,
      away_team: row.AwayTeam,
      full_time_home_goals: Number(row.FTHG),
      full_time_away_goals: Number(row.FTAG),
      full_time_result: row.FTR || resultFor(Number(row.FTHG), Number(row.FTAG)),
    }))
    .filter((row) => row.match_date)
    .sort((a, b) => a.match_date.localeCompare(b.match_date) || a.source_row - b.source_row)

  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .upsert({
      code,
      display_name: displayName(code),
      competition: COMPETITION,
      source_url: url,
      fixture_count: rows.length,
      is_complete: rows.length >= 380,
    }, { onConflict: 'code' })
    .select('id')
    .single()

  if (seasonError) throw seasonError

  const table = new Map()
  const fixtures = rows.map((match) => {
    const fixture = {
      ...match,
      season_id: season.id,
      home_snapshot: snapshot(table, match.home_team, 'home'),
      away_snapshot: snapshot(table, match.away_team, 'away'),
    }
    applyResult(table, match)
    return fixture
  })

  const { error: deleteError } = await supabase.from('fixtures').delete().eq('season_id', season.id)
  if (deleteError) throw deleteError

  for (let i = 0; i < fixtures.length; i += 500) {
    const { error } = await supabase.from('fixtures').insert(fixtures.slice(i, i + 500))
    if (error) throw error
  }

  console.log(`Imported ${displayName(code)}: ${fixtures.length} fixtures`)
}

for (const code of seasonCodes()) {
  await importSeason(code)
}
