import { getSupabase, getUser, londonDate, shuffle, makeOptions, scorePoints, json } from './_gameHelpers.js'

const DEFAULT_LEAGUE = { country: 'England', competition: 'E0', leagueName: 'Premier League' }
const MAX_DAILY_ROUNDS = 46

function cleanText(value, fallback) {
  const text = String(value || fallback).trim().slice(0, 80)
  return text || fallback
}

async function checked(step, query) {
  const result = await query
  if (result.error) {
    const parts = [step, result.error.message, result.error.details, result.error.hint, result.error.code].filter(Boolean)
    throw new Error(parts.join(': '))
  }
  return result
}

function tierName(level) {
  if (level === 1) return 'Premier League'
  if (level === 2) return 'Championship'
  if (level === 3) return 'League 1'
  if (level === 4) return 'League 2'
  if (level === 5) return 'National League'
  return `National League ${level - 4}`
}

function tierSize(level) {
  return level === 1 ? 20 : 24
}

function tierSeasonLength(level) {
  return tierSize(level) * 2 - 2
}

function zeroScore() {
  return { totalPoints: 0, correctScores: 0, correctResults: 0 }
}

function outcome(prediction) {
  if (prediction.exact_score) return { code: 'W', label: 'Spot on', points: 3 }
  if (prediction.correct_result) return { code: 'D', label: 'Result right', points: 1 }
  return { code: 'L', label: 'Wrong', points: 0 }
}

function isBotProfile(profile) {
  const email = String(profile.email || '').toLowerCase()
  const username = String(profile.username || '').toLowerCase()
  return profile.is_bot === true || email.endsWith('.test') || email.includes('+bot') || /_[0-9]{4}$/.test(username)
}

function emptyTeam(name) {
  return { name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [], homeForm: [], awayForm: [] }
}

function applyFixtureToTable(table, fixture) {
  const home = table.get(fixture.home_team) || emptyTeam(fixture.home_team)
  const away = table.get(fixture.away_team) || emptyTeam(fixture.away_team)
  const hg = Number(fixture.full_time_home_goals)
  const ag = Number(fixture.full_time_away_goals)
  const hr = hg > ag ? 'W' : hg === ag ? 'D' : 'L'
  const ar = ag > hg ? 'W' : hg === ag ? 'D' : 'L'
  home.played += 1; away.played += 1
  home.goalsFor += hg; home.goalsAgainst += ag
  away.goalsFor += ag; away.goalsAgainst += hg
  home.points += hr === 'W' ? 3 : hr === 'D' ? 1 : 0
  away.points += ar === 'W' ? 3 : ar === 'D' ? 1 : 0
  home.won += hr === 'W' ? 1 : 0; home.drawn += hr === 'D' ? 1 : 0; home.lost += hr === 'L' ? 1 : 0
  away.won += ar === 'W' ? 1 : 0; away.drawn += ar === 'D' ? 1 : 0; away.lost += ar === 'L' ? 1 : 0
  home.form.push(hr); away.form.push(ar); home.homeForm.push(hr); away.awayForm.push(ar)
  table.set(home.name, home); table.set(away.name, away)
}

function teamSnapshot(table, teamName, venue, fallback = {}) {
  const sorted = [...table.values()].sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name))
  const row = table.get(teamName) || emptyTeam(teamName)
  return {
    ...fallback,
    position: sorted.findIndex((item) => item.name === teamName) + 1 || fallback.position || null,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalsFor - row.goalsAgainst,
    points: row.points,
    form: row.form.slice(-5).join('') || fallback.form || '',
    venueForm: (venue === 'home' ? row.homeForm : row.awayForm).slice(-5).join('') || fallback.venueForm || '',
  }
}

async function buildLiveSnapshots(supabase, fixture) {
  const result = await checked('season fixtures lookup', supabase
    .from('fixtures')
    .select('source_row, match_date, home_team, away_team, full_time_home_goals, full_time_away_goals')
    .eq('season_id', fixture.season_id)
    .order('match_date')
    .order('source_row'))
  const table = new Map()
  for (const past of result.data || []) {
    const before = past.match_date < fixture.match_date || (past.match_date === fixture.match_date && past.source_row < fixture.source_row)
    if (before) applyFixtureToTable(table, past)
  }
  return {
    home: teamSnapshot(table, fixture.home_team, 'home', fixture.home_snapshot || {}),
    away: teamSnapshot(table, fixture.away_team, 'away', fixture.away_snapshot || {}),
  }
}

async function assignTierPlace(supabase, league) {
  const result = await checked('tier allocation lookup', supabase
    .from('user_profiles')
    .select('pyramid_level, tier_slot')
    .eq('country', league.country)
    .eq('competition', league.competition)
    .not('tier_slot', 'is', null))
  const occupied = new Map()
  for (const profile of result.data || []) {
    const level = Number(profile.pyramid_level || 1)
    const slot = Number(profile.tier_slot || 0)
    if (!slot) continue
    if (!occupied.has(level)) occupied.set(level, new Set())
    occupied.get(level).add(slot)
  }
  for (let level = 1; level < 1000; level += 1) {
    const used = occupied.get(level) || new Set()
    for (let slot = 1; slot <= tierSize(level); slot += 1) {
      if (!used.has(slot)) return { level, name: tierName(level), slot }
    }
  }
  throw new Error('Could not allocate tier place')
}

async function ensureProfile(supabase, user) {
  const profileResult = await checked('profile lookup', supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle())
  const profile = profileResult.data || {}
  const league = {
    country: cleanText(profile.country || user.user_metadata?.country, DEFAULT_LEAGUE.country),
    competition: cleanText(profile.competition || user.user_metadata?.competition, DEFAULT_LEAGUE.competition),
    leagueName: cleanText(profile.league_name || user.user_metadata?.leagueName || user.user_metadata?.league_name, DEFAULT_LEAGUE.leagueName),
  }
  const needsTier = !profile.pyramid_level || !profile.tier_slot || profile.country !== league.country || profile.competition !== league.competition
  const place = needsTier ? await assignTierPlace(supabase, league) : { level: profile.pyramid_level, name: profile.tier_name || tierName(profile.pyramid_level), slot: profile.tier_slot }
  const username = String(user.user_metadata?.username || profile.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
  const saved = await checked('profile upsert', supabase
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      email: user.email || profile.email,
      country: league.country,
      competition: league.competition,
      league_name: league.leagueName,
      pyramid_level: place.level,
      tier_name: place.name,
      tier_slot: place.slot,
      ...(username ? { username } : {}),
    }, { onConflict: 'user_id' })
    .select('*')
    .single())
  return { profile: saved.data, league }
}

async function ensureDailyGameFixtures(supabase, dailyGame) {
  const existing = await checked('daily game fixtures count', supabase.from('daily_game_fixtures').select('id').eq('daily_game_id', dailyGame.id))
  if ((existing.data || []).length >= MAX_DAILY_ROUNDS) return
  if ((existing.data || []).length > 0) {
    await checked('daily game fixtures reset', supabase.from('daily_game_fixtures').delete().eq('daily_game_id', dailyGame.id))
  }
  const fixtures = await checked('fixtures lookup', supabase.from('fixtures').select('*').eq('season_id', dailyGame.season_id))
  if ((fixtures.data || []).length < MAX_DAILY_ROUNDS) throw new Error('Selected season does not have enough imported fixtures yet')
  const rows = shuffle(fixtures.data, dailyGame.seed).slice(0, MAX_DAILY_ROUNDS).map((fixture, index) => ({
    daily_game_id: dailyGame.id,
    fixture_id: fixture.id,
    round_number: index + 1,
    options: makeOptions(fixture, `${dailyGame.seed}:${fixture.id}`),
  }))
  await checked('daily game fixtures insert', supabase.from('daily_game_fixtures').insert(rows))
}

async function ensureDailyGame(supabase, gameDate, league) {
  const existing = await checked('daily game lookup', supabase
    .from('daily_games')
    .select('*, seasons(*)')
    .eq('game_date', gameDate)
    .eq('country', league.country)
    .eq('competition', league.competition)
    .maybeSingle())
  if (existing.data) {
    await ensureDailyGameFixtures(supabase, existing.data)
    return existing.data
  }
  const seasons = await checked('season lookup', supabase
    .from('seasons')
    .select('*')
    .eq('country', league.country)
    .eq('competition', league.competition)
    .eq('is_complete', true)
    .order('code'))
  if (!seasons.data?.length) throw new Error(`No complete seasons imported for ${league.country} - ${league.leagueName}`)
  const season = shuffle(seasons.data, `season:${gameDate}:${league.country}:${league.competition}`)[0]
  const created = await checked('daily game insert', supabase
    .from('daily_games')
    .insert({ game_date: gameDate, country: league.country, competition: league.competition, league_name: league.leagueName, season_id: season.id, seed: `daily:${gameDate}:${league.country}:${league.competition}:${season.code}` })
    .select('*, seasons(*)')
    .single())
  await ensureDailyGameFixtures(supabase, created.data)
  return created.data
}

async function simulateBotPredictions({ supabase, roster, rounds, dailyGame, seasonLength, existingPredictions }) {
  const existing = new Set((existingPredictions || []).map((row) => `${row.user_id}:${row.daily_game_fixture_id}`))
  const rows = []

  for (const profile of roster) {
    if (!isBotProfile(profile)) continue
    const order = shuffle(rounds, `${dailyGame.seed}:user:${profile.user_id}`).slice(0, seasonLength)
    for (const round of order) {
      const key = `${profile.user_id}:${round.id}`
      if (existing.has(key)) continue
      const option = shuffle(round.options || [], `${dailyGame.seed}:bot:${profile.user_id}:${round.id}`)[0]
      if (!option) continue
      rows.push({
        daily_game_fixture_id: round.id,
        user_id: profile.user_id,
        predicted_home_goals: Number(option.homeGoals),
        predicted_away_goals: Number(option.awayGoals),
        is_auto: true,
        ...scorePoints(round.fixtures, Number(option.homeGoals), Number(option.awayGoals)),
      })
      existing.add(key)
    }
  }

  for (let index = 0; index < rows.length; index += 500) {
    await checked('bot predictions upsert', supabase
      .from('predictions')
      .upsert(rows.slice(index, index + 500), { onConflict: 'daily_game_fixture_id,user_id' }))
  }
}

export async function handler(event) {
  try {
    const supabase = getSupabase()
    const user = await getUser(event, supabase)
    const { profile, league } = await ensureProfile(supabase, user)
    const seasonLength = tierSeasonLength(profile.pyramid_level)
    const gameDate = londonDate()
    const dailyGame = await ensureDailyGame(supabase, gameDate, league)
    const rounds = await checked('rounds lookup', supabase
      .from('daily_game_fixtures')
      .select('id, round_number, options, fixtures(*)')
      .eq('daily_game_id', dailyGame.id)
      .order('round_number'))
    if (!rounds.data?.length) throw new Error('Today\'s game has no fixtures')

    const userRounds = shuffle(rounds.data, `${dailyGame.seed}:user:${user.id}`).slice(0, seasonLength).map((round, index) => ({ ...round, userRoundNumber: index + 1 }))
    const roundIds = userRounds.map((round) => round.id)
    const userPredictions = await checked('user predictions lookup', supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_auto', false)
      .in('daily_game_fixture_id', roundIds))
    const predictionsByRound = new Map(userPredictions.data.map((prediction) => [prediction.daily_game_fixture_id, prediction]))
    const nextRound = userRounds.find((round) => !predictionsByRound.has(round.id))
    const completed = predictionsByRound.size >= userRounds.length
    const currentUserPlayed = userPredictions.data.length
    const score = userPredictions.data.reduce((acc, prediction) => ({
      totalPoints: acc.totalPoints + prediction.points,
      correctScores: acc.correctScores + (prediction.exact_score ? 1 : 0),
      correctResults: acc.correctResults + (prediction.correct_result ? 1 : 0),
    }), zeroScore())
    const resultHistory = userRounds.map((round) => {
      const prediction = predictionsByRound.get(round.id)
      return prediction ? { roundNumber: round.userRoundNumber, ...outcome(prediction) } : null
    }).filter(Boolean)

    const roster = await checked('tier roster lookup', supabase
      .from('user_profiles')
      .select('*')
      .eq('country', league.country)
      .eq('competition', league.competition)
      .eq('pyramid_level', profile.pyramid_level)
      .not('tier_slot', 'is', null)
      .lte('tier_slot', tierSize(profile.pyramid_level))
      .order('tier_slot'))
    const rosterIds = new Set(roster.data.map((row) => row.user_id))
    let tierPredictions = await checked('tier predictions lookup', supabase
      .from('predictions')
      .select('user_id, daily_game_fixture_id, points, exact_score, correct_result')
      .in('daily_game_fixture_id', roundIds))

    await simulateBotPredictions({
      supabase,
      roster: roster.data,
      rounds: rounds.data,
      dailyGame,
      seasonLength,
      existingPredictions: tierPredictions.data || [],
    })

    tierPredictions = await checked('tier predictions refresh', supabase
      .from('predictions')
      .select('user_id, daily_game_fixture_id, points, exact_score, correct_result')
      .in('daily_game_fixture_id', roundIds))

    const predictionsByUser = new Map()
    for (const prediction of tierPredictions.data || []) {
      if (!rosterIds.has(prediction.user_id)) continue
      if (!predictionsByUser.has(prediction.user_id)) predictionsByUser.set(prediction.user_id, new Map())
      predictionsByUser.get(prediction.user_id).set(prediction.daily_game_fixture_id, prediction)
    }
    const leaderboard = roster.data.map((rowProfile) => {
      const order = shuffle(rounds.data, `${dailyGame.seed}:user:${rowProfile.user_id}`).slice(0, currentUserPlayed)
      const playerPredictions = predictionsByUser.get(rowProfile.user_id) || new Map()
      const row = { userId: rowProfile.user_id, email: rowProfile.email, username: rowProfile.username, displayName: rowProfile.username || rowProfile.email || 'Player', played: 0, wins: 0, draws: 0, losses: 0, totalPoints: 0 }
      for (const round of order) {
        const prediction = playerPredictions.get(round.id)
        if (!prediction) continue
        row.played += 1
        row.totalPoints += prediction.points
        if (prediction.exact_score) row.wins += 1
        else if (prediction.correct_result) row.draws += 1
        else row.losses += 1
      }
      return row
    }).sort((a, b) => b.totalPoints - a.totalPoints || b.wins - a.wins || b.draws - a.draws || a.losses - b.losses || a.displayName.localeCompare(b.displayName))

    let currentRound = null
    if (!completed && nextRound) {
      const snapshots = await buildLiveSnapshots(supabase, nextRound.fixtures)
      currentRound = {
        dailyGameFixtureId: nextRound.id,
        roundNumber: nextRound.userRoundNumber,
        fixtureDate: nextRound.fixtures.match_date,
        options: nextRound.options,
        home: { name: nextRound.fixtures.home_team, snapshot: snapshots.home },
        away: { name: nextRound.fixtures.away_team, snapshot: snapshots.away },
      }
    }

    return json(200, {
      gameDate,
      country: league.country,
      competition: league.competition,
      leagueName: league.leagueName,
      tier: { level: profile.pyramid_level, name: profile.tier_name || tierName(profile.pyramid_level), slot: profile.tier_slot, size: tierSize(profile.pyramid_level) },
      season: { code: dailyGame.seasons?.code, displayName: dailyGame.seasons?.display_name || league.leagueName },
      totalRounds: userRounds.length,
      leaderboardRoundLimit: currentUserPlayed,
      completed,
      userScore: score,
      resultHistory,
      leaderboard,
      currentRound,
    })
  } catch (error) {
    return json(500, { error: error.message || 'Unknown getDailyGame error', name: error.name, details: error.details, hint: error.hint, code: error.code })
  }
}
