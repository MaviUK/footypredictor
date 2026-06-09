import { getSupabase, getUser, londonDate, shuffle, makeOptions, json } from './_gameHelpers.js'

const DEFAULT_COUNTRY = 'England'
const DEFAULT_COMPETITION = 'E0'
const DEFAULT_LEAGUE_NAME = 'Premier League'

function cleanText(value, fallback) {
  const text = String(value || fallback).trim().slice(0, 80)
  return text || fallback
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

async function assignTierPlace(supabase, country, competition) {
  const profilesResult = await supabase
    .from('user_profiles')
    .select('pyramid_level, tier_slot')
    .eq('country', country)
    .eq('competition', competition)
    .not('tier_slot', 'is', null)

  if (profilesResult.error) throw profilesResult.error

  const occupied = new Map()
  for (const profile of profilesResult.data || []) {
    const level = Number(profile.pyramid_level || 1)
    const slot = Number(profile.tier_slot || 0)
    if (!slot) continue
    if (!occupied.has(level)) occupied.set(level, new Set())
    occupied.get(level).add(slot)
  }

  for (let level = 1; level < 1000; level += 1) {
    const used = occupied.get(level) || new Set()
    const size = tierSize(level)
    for (let slot = 1; slot <= size; slot += 1) {
      if (!used.has(slot)) {
        return { pyramidLevel: level, tierName: tierName(level), tierSlot: slot }
      }
    }
  }

  throw new Error('Could not allocate user to a tier')
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

function predictionOutcome(prediction) {
  if (prediction.exact_score) return { code: 'W', label: 'Spot on', points: 3 }
  if (prediction.correct_result) return { code: 'D', label: 'Result right', points: 1 }
  return { code: 'L', label: 'Wrong', points: 0 }
}

function applyFixtureToTable(table, fixture) {
  const home = table.get(fixture.home_team) || emptyTeam(fixture.home_team)
  const away = table.get(fixture.away_team) || emptyTeam(fixture.away_team)
  const homeGoals = Number(fixture.full_time_home_goals)
  const awayGoals = Number(fixture.full_time_away_goals)
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

function tableSnapshot(table, teamName, venue, fallback = {}) {
  const sorted = [...table.values()].sort((a, b) =>
    b.points - a.points ||
    (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor ||
    a.name.localeCompare(b.name),
  )
  const row = table.get(teamName) || emptyTeam(teamName)
  const position = sorted.findIndex((item) => item.name === teamName) + 1 || fallback.position || null

  return {
    ...fallback,
    position,
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
  const seasonFixturesResult = await supabase
    .from('fixtures')
    .select('source_row, match_date, home_team, away_team, full_time_home_goals, full_time_away_goals')
    .eq('season_id', fixture.season_id)
    .order('match_date')
    .order('source_row')

  if (seasonFixturesResult.error) throw seasonFixturesResult.error

  const table = new Map()
  for (const pastFixture of seasonFixturesResult.data || []) {
    const isBefore = pastFixture.match_date < fixture.match_date ||
      (pastFixture.match_date === fixture.match_date && pastFixture.source_row < fixture.source_row)

    if (!isBefore) continue
    applyFixtureToTable(table, pastFixture)
  }

  return {
    home: tableSnapshot(table, fixture.home_team, 'home', fixture.home_snapshot || {}),
    away: tableSnapshot(table, fixture.away_team, 'away', fixture.away_snapshot || {}),
  }
}

async function ensureDailyGameFixtures(supabase, dailyGame) {
  const existingRounds = await supabase
    .from('daily_game_fixtures')
    .select('id')
    .eq('daily_game_id', dailyGame.id)

  if (existingRounds.error) throw existingRounds.error
  if ((existingRounds.data || []).length >= 38) return

  if ((existingRounds.data || []).length > 0) {
    const deleteResult = await supabase
      .from('daily_game_fixtures')
      .delete()
      .eq('daily_game_id', dailyGame.id)

    if (deleteResult.error) throw deleteResult.error
  }

  const fixturesResult = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', dailyGame.season_id)

  if (fixturesResult.error) throw fixturesResult.error
  if ((fixturesResult.data || []).length < 38) {
    throw new Error('Today\'s selected season does not have enough imported fixtures yet. Re-run the Football-Data importer.')
  }

  const selected = shuffle(fixturesResult.data, dailyGame.seed).slice(0, 38)
  const gameFixtures = selected.map((fixture, index) => ({
    daily_game_id: dailyGame.id,
    fixture_id: fixture.id,
    round_number: index + 1,
    options: makeOptions(fixture, `${dailyGame.seed}:${fixture.id}`),
  }))

  const insertFixtures = await supabase.from('daily_game_fixtures').insert(gameFixtures)
  if (insertFixtures.error) throw insertFixtures.error
}

async function ensureDailyGame(supabase, gameDate, league) {
  const existing = await supabase
    .from('daily_games')
    .select('*, seasons(*)')
    .eq('game_date', gameDate)
    .eq('country', league.country)
    .eq('competition', league.competition)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data) {
    await ensureDailyGameFixtures(supabase, existing.data)
    return existing.data
  }

  const seasonsResult = await supabase
    .from('seasons')
    .select('*')
    .eq('country', league.country)
    .eq('competition', league.competition)
    .eq('is_complete', true)
    .order('code')

  if (seasonsResult.error) throw seasonsResult.error
  if (!seasonsResult.data?.length) throw new Error(`No complete seasons imported for ${league.country} - ${league.leagueName}`)

  const season = shuffle(seasonsResult.data, `season:${gameDate}:${league.country}:${league.competition}`)[0]
  const created = await supabase
    .from('daily_games')
    .insert({
      game_date: gameDate,
      country: league.country,
      competition: league.competition,
      league_name: league.leagueName,
      season_id: season.id,
      seed: `daily:${gameDate}:${league.country}:${league.competition}:${season.code}`,
    })
    .select('*, seasons(*)')
    .single()

  if (created.error) throw created.error

  await ensureDailyGameFixtures(supabase, created.data)
  return created.data
}

async function reopenTodaysGameIfAutoClosed(supabase, dailyGame, roundIds, gameDate) {
  if (dailyGame.game_date !== gameDate) return dailyGame

  const autoDelete = await supabase
    .from('predictions')
    .delete()
    .eq('is_auto', true)
    .in('daily_game_fixture_id', roundIds)

  if (autoDelete.error) throw autoDelete.error

  if (dailyGame.status === 'closed') {
    const resultsDelete = await supabase
      .from('daily_results')
      .delete()
      .eq('daily_game_id', dailyGame.id)

    if (resultsDelete.error) throw resultsDelete.error

    const reopenResult = await supabase
      .from('daily_games')
      .update({ status: 'open', winner_user_id: null, closed_at: null })
      .eq('id', dailyGame.id)
      .select('*, seasons(*)')
      .single()

    if (reopenResult.error) throw reopenResult.error
    return reopenResult.data
  }

  return dailyGame
}

function zeroScore() {
  return { totalPoints: 0, correctScores: 0, correctResults: 0 }
}

export async function handler(event) {
  try {
    const supabase = getSupabase()
    const user = await getUser(event, supabase)
    const profileResult = await supabase
      .from('user_profiles')
      .select('email, username, country, competition, league_name, pyramid_level, tier_name, tier_slot')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileResult.error) throw profileResult.error

    const profile = profileResult.data || {}
    const league = {
      country: cleanText(profile.country || user.user_metadata?.country, DEFAULT_COUNTRY),
      competition: cleanText(profile.competition || user.user_metadata?.competition, DEFAULT_COMPETITION),
      leagueName: cleanText(profile.league_name || user.user_metadata?.leagueName || user.user_metadata?.league_name, DEFAULT_LEAGUE_NAME),
    }

    const needsTier = !profile.pyramid_level || !profile.tier_slot || profile.country !== league.country || profile.competition !== league.competition
    const assigned = needsTier
      ? await assignTierPlace(supabase, league.country, league.competition)
      : {
        pyramidLevel: profile.pyramid_level,
        tierName: profile.tier_name || tierName(profile.pyramid_level),
        tierSlot: profile.tier_slot,
      }

    const username = String(user.user_metadata?.username || profile.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
    const profileUpdate = {
      user_id: user.id,
      email: user.email || profile.email,
      country: league.country,
      competition: league.competition,
      league_name: league.leagueName,
      pyramid_level: assigned.pyramidLevel,
      tier_name: assigned.tierName,
      tier_slot: assigned.tierSlot,
      ...(username ? { username } : {}),
    }

    const savedProfileResult = await supabase
      .from('user_profiles')
      .upsert(profileUpdate, { onConflict: 'user_id' })
      .select('*')
      .single()

    if (savedProfileResult.error) throw savedProfileResult.error

    const savedProfile = savedProfileResult.data
    const gameDate = londonDate()
    let dailyGame = await ensureDailyGame(supabase, gameDate, league)

    const roundsResult = await supabase
      .from('daily_game_fixtures')
      .select('id, round_number, options, fixtures(*)')
      .eq('daily_game_id', dailyGame.id)
      .order('round_number')

    if (roundsResult.error) throw roundsResult.error
    if (!roundsResult.data?.length) throw new Error('Today\'s game has no fixtures. Please refresh in a moment.')

    const userRounds = shuffle(roundsResult.data, `${dailyGame.seed}:user:${user.id}`)
      .map((round, index) => ({ ...round, userRoundNumber: index + 1 }))
    const roundIds = roundsResult.data.map((round) => round.id)
    dailyGame = await reopenTodaysGameIfAutoClosed(supabase, dailyGame, roundIds, gameDate)

    const predictionsResult = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_auto', false)
      .in('daily_game_fixture_id', roundIds)

    if (predictionsResult.error) throw predictionsResult.error

    const predictionsByRound = new Map(predictionsResult.data.map((prediction) => [prediction.daily_game_fixture_id, prediction]))
    const nextRound = userRounds.find((round) => !predictionsByRound.has(round.id))
    const completed = dailyGame.status === 'closed' || (userRounds.length >= 38 && predictionsByRound.size >= userRounds.length)
    const score = predictionsResult.data.reduce((acc, prediction) => ({
      totalPoints: acc.totalPoints + prediction.points,
      correctScores: acc.correctScores + (prediction.exact_score ? 1 : 0),
      correctResults: acc.correctResults + (prediction.correct_result ? 1 : 0),
    }), zeroScore())

    const currentUserPlayed = predictionsResult.data.length
    const resultHistory = userRounds
      .map((round) => {
        const prediction = predictionsByRound.get(round.id)
        if (!prediction) return null
        return {
          roundNumber: round.userRoundNumber,
          ...predictionOutcome(prediction),
        }
      })
      .filter(Boolean)

    const rosterResult = await supabase
      .from('user_profiles')
      .select('user_id, email, username, country, competition, league_name, pyramid_level, tier_name, tier_slot')
      .eq('country', league.country)
      .eq('competition', league.competition)
      .eq('pyramid_level', savedProfile.pyramid_level)
      .order('tier_slot')

    if (rosterResult.error) throw rosterResult.error

    const rosterIds = rosterResult.data.map((row) => row.user_id)
    const leaderboardResult = rosterIds.length
      ? await supabase
        .from('predictions')
        .select('user_id, daily_game_fixture_id, points, exact_score, correct_result')
        .eq('is_auto', false)
        .in('daily_game_fixture_id', roundIds)
        .in('user_id', rosterIds)
      : { data: [], error: null }

    if (leaderboardResult.error) throw leaderboardResult.error

    const predictionsByUser = new Map()
    for (const row of leaderboardResult.data) {
      if (!predictionsByUser.has(row.user_id)) predictionsByUser.set(row.user_id, new Map())
      predictionsByUser.get(row.user_id).set(row.daily_game_fixture_id, row)
    }

    const leaderboard = rosterResult.data.map((rowProfile) => {
      const userOrder = shuffle(roundsResult.data, `${dailyGame.seed}:user:${rowProfile.user_id}`)
      const comparableRounds = userOrder.slice(0, currentUserPlayed)
      const userPredictions = predictionsByUser.get(rowProfile.user_id) || new Map()
      const row = {
        userId: rowProfile.user_id,
        email: rowProfile.email,
        username: rowProfile.username,
        country: rowProfile.country,
        competition: rowProfile.competition,
        leagueName: rowProfile.league_name,
        pyramidLevel: rowProfile.pyramid_level,
        tierName: rowProfile.tier_name || tierName(rowProfile.pyramid_level),
        tierSlot: rowProfile.tier_slot,
        displayName: rowProfile.username || rowProfile.email || 'Player',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        totalPoints: 0,
      }

      for (const round of comparableRounds) {
        const prediction = userPredictions.get(round.id)
        if (!prediction) continue

        row.played += 1
        row.totalPoints += prediction.points
        if (prediction.exact_score) {
          row.wins += 1
        } else if (prediction.correct_result) {
          row.draws += 1
        } else {
          row.losses += 1
        }
      }

      return row
    })
      .sort((a, b) =>
        b.totalPoints - a.totalPoints ||
        b.wins - a.wins ||
        b.draws - a.draws ||
        a.losses - b.losses ||
        (a.tierSlot || 9999) - (b.tierSlot || 9999) ||
        a.displayName.localeCompare(b.displayName),
      )

    let currentRound = null
    if (!completed && nextRound) {
      const liveSnapshots = await buildLiveSnapshots(supabase, nextRound.fixtures)
      currentRound = {
        dailyGameFixtureId: nextRound.id,
        roundNumber: nextRound.userRoundNumber,
        fixtureDate: nextRound.fixtures.match_date,
        options: nextRound.options,
        home: {
          name: nextRound.fixtures.home_team,
          snapshot: liveSnapshots.home,
        },
        away: {
          name: nextRound.fixtures.away_team,
          snapshot: liveSnapshots.away,
        },
      }
    }

    return json(200, {
      gameDate,
      country: league.country,
      competition: league.competition,
      leagueName: league.leagueName,
      tier: {
        level: savedProfile.pyramid_level,
        name: savedProfile.tier_name || tierName(savedProfile.pyramid_level),
        slot: savedProfile.tier_slot,
        size: tierSize(savedProfile.pyramid_level),
      },
      season: {
        code: dailyGame.seasons.code,
        displayName: dailyGame.seasons.display_name,
      },
      totalRounds: userRounds.length,
      leaderboardRoundLimit: currentUserPlayed,
      completed,
      userScore: score,
      resultHistory,
      leaderboard,
      currentRound,
    })
  } catch (error) {
    return json(500, { error: error.message })
  }
}
