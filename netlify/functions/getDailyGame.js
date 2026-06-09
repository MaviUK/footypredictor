import { getSupabase, getUser, londonDate, shuffle, makeOptions, json } from './_gameHelpers.js'

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

async function ensureDailyGame(supabase, gameDate) {
  const existing = await supabase
    .from('daily_games')
    .select('*, seasons(*)')
    .eq('game_date', gameDate)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data) {
    await ensureDailyGameFixtures(supabase, existing.data)
    return existing.data
  }

  const seasonsResult = await supabase
    .from('seasons')
    .select('*')
    .eq('competition', 'E0')
    .eq('is_complete', true)
    .order('code')

  if (seasonsResult.error) throw seasonsResult.error
  if (!seasonsResult.data?.length) throw new Error('No complete Premier League seasons have been imported yet')

  const season = shuffle(seasonsResult.data, `season:${gameDate}`)[0]
  const created = await supabase
    .from('daily_games')
    .insert({ game_date: gameDate, season_id: season.id, seed: `daily:${gameDate}:${season.code}` })
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
    const gameDate = londonDate()
    let dailyGame = await ensureDailyGame(supabase, gameDate)

    const roundsResult = await supabase
      .from('daily_game_fixtures')
      .select('id, round_number, options, fixtures(*)')
      .eq('daily_game_id', dailyGame.id)
      .order('round_number')

    if (roundsResult.error) throw roundsResult.error
    if (!roundsResult.data?.length) throw new Error('Today\'s game has no fixtures. Please refresh in a moment.')

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
    const nextRound = roundsResult.data.find((round) => !predictionsByRound.has(round.id))
    const completed = dailyGame.status === 'closed' || (roundsResult.data.length >= 38 && predictionsByRound.size >= roundsResult.data.length)
    const score = predictionsResult.data.reduce((acc, prediction) => ({
      totalPoints: acc.totalPoints + prediction.points,
      correctScores: acc.correctScores + (prediction.exact_score ? 1 : 0),
      correctResults: acc.correctResults + (prediction.correct_result ? 1 : 0),
    }), zeroScore())

    const leaderboardResult = await supabase
      .from('predictions')
      .select('user_id, points, exact_score, correct_result')
      .in('daily_game_fixture_id', roundIds)

    if (leaderboardResult.error) throw leaderboardResult.error

    const leaderboardUserIds = [...new Set(leaderboardResult.data.map((row) => row.user_id))]
    const profilesResult = leaderboardUserIds.length
      ? await supabase
        .from('user_profiles')
        .select('user_id, email')
        .in('user_id', leaderboardUserIds)
      : { data: [], error: null }

    if (profilesResult.error) throw profilesResult.error

    const emailByUserId = new Map(profilesResult.data.map((profile) => [profile.user_id, profile.email]))
    const leaderboardMap = new Map()

    for (const row of leaderboardResult.data) {
      const current = leaderboardMap.get(row.user_id) || {
        userId: row.user_id,
        email: emailByUserId.get(row.user_id),
        totalPoints: 0,
      }
      current.totalPoints += row.points
      leaderboardMap.set(row.user_id, current)
    }

    const leaderboard = [...leaderboardMap.values()]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 20)

    let currentRound = null
    if (!completed && nextRound) {
      const liveSnapshots = await buildLiveSnapshots(supabase, nextRound.fixtures)
      currentRound = {
        dailyGameFixtureId: nextRound.id,
        roundNumber: nextRound.round_number,
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
      season: {
        code: dailyGame.seasons.code,
        displayName: dailyGame.seasons.display_name,
      },
      totalRounds: roundsResult.data.length,
      completed,
      userScore: score,
      leaderboard,
      currentRound,
    })
  } catch (error) {
    return json(500, { error: error.message })
  }
}
