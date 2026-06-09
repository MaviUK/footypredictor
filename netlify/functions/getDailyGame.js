import { getSupabase, getUser, londonDate, shuffle, makeOptions, json } from './_gameHelpers.js'

async function ensureDailyGame(supabase, gameDate) {
  const existing = await supabase
    .from('daily_games')
    .select('*, seasons(*)')
    .eq('game_date', gameDate)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data) return existing.data

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

  const fixturesResult = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', season.id)

  if (fixturesResult.error) throw fixturesResult.error

  const selected = shuffle(fixturesResult.data, created.data.seed).slice(0, 38)
  const gameFixtures = selected.map((fixture, index) => ({
    daily_game_id: created.data.id,
    fixture_id: fixture.id,
    round_number: index + 1,
    options: makeOptions(fixture, `${created.data.seed}:${fixture.id}`),
  }))

  const insertFixtures = await supabase.from('daily_game_fixtures').insert(gameFixtures)
  if (insertFixtures.error) throw insertFixtures.error

  return created.data
}

function zeroScore() {
  return { totalPoints: 0, correctScores: 0, correctResults: 0 }
}

export async function handler(event) {
  try {
    const supabase = getSupabase()
    const user = await getUser(event, supabase)
    const gameDate = londonDate()
    const dailyGame = await ensureDailyGame(supabase, gameDate)

    const roundsResult = await supabase
      .from('daily_game_fixtures')
      .select('id, round_number, options, fixtures(*)')
      .eq('daily_game_id', dailyGame.id)
      .order('round_number')

    if (roundsResult.error) throw roundsResult.error

    const predictionsResult = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user.id)
      .in('daily_game_fixture_id', roundsResult.data.map((round) => round.id))

    if (predictionsResult.error) throw predictionsResult.error

    const predictionsByRound = new Map(predictionsResult.data.map((prediction) => [prediction.daily_game_fixture_id, prediction]))
    const nextRound = roundsResult.data.find((round) => !predictionsByRound.has(round.id))
    const score = predictionsResult.data.reduce((acc, prediction) => ({
      totalPoints: acc.totalPoints + prediction.points,
      correctScores: acc.correctScores + (prediction.exact_score ? 1 : 0),
      correctResults: acc.correctResults + (prediction.correct_result ? 1 : 0),
    }), zeroScore())

    const leaderboardResult = await supabase
      .from('predictions')
      .select('user_id, points, exact_score, correct_result, user_profiles(email)')
      .in('daily_game_fixture_id', roundsResult.data.map((round) => round.id))

    if (leaderboardResult.error) throw leaderboardResult.error

    const leaderboardMap = new Map()
    for (const row of leaderboardResult.data) {
      const current = leaderboardMap.get(row.user_id) || { userId: row.user_id, email: row.user_profiles?.email, totalPoints: 0 }
      current.totalPoints += row.points
      leaderboardMap.set(row.user_id, current)
    }

    const leaderboard = [...leaderboardMap.values()]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 20)

    return json(200, {
      gameDate,
      season: {
        code: dailyGame.seasons.code,
        displayName: dailyGame.seasons.display_name,
      },
      totalRounds: 38,
      completed: !nextRound,
      userScore: score,
      leaderboard,
      currentRound: nextRound ? {
        dailyGameFixtureId: nextRound.id,
        roundNumber: nextRound.round_number,
        options: nextRound.options,
        home: {
          name: nextRound.fixtures.home_team,
          snapshot: nextRound.fixtures.home_snapshot,
        },
        away: {
          name: nextRound.fixtures.away_team,
          snapshot: nextRound.fixtures.away_snapshot,
        },
      } : null,
    })
  } catch (error) {
    return json(500, { error: error.message })
  }
}
