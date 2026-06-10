import { getSupabase, getUser, json } from './_gameHelpers.js'

function tierName(level) {
  const value = Number(level || 1)
  if (value === 1) return 'Premier League'
  if (value === 2) return 'Championship'
  if (value === 3) return 'League 1'
  if (value === 4) return 'League 2'
  if (value === 5) return 'National League'
  return `National League ${value - 4}`
}

function movementLabel(row) {
  if (Number(row.rank) === 1) return 'Champion'
  if (row.movement === 'promoted') return 'Promoted'
  if (row.movement === 'relegated') return 'Relegated'
  return 'Stayed'
}

function statusClass(row) {
  if (Number(row.rank) === 1) return 'champion'
  if (row.movement === 'promoted') return 'promoted'
  if (row.movement === 'relegated') return 'relegated'
  return 'stayed'
}

function displayName(profile) {
  return profile?.club_name || profile?.username || profile?.email || 'Club'
}

function seasonLabel(game) {
  return game?.seasons?.display_name || game?.league_name || game?.game_date || 'Season'
}

function predictionCode(row) {
  if (row.exact_score) return 'W'
  if (row.correct_result) return 'D'
  return 'L'
}

function scoreText(home, away) {
  if (home === null || home === undefined || away === null || away === undefined) return '-'
  return `${home}-${away}`
}

async function loadTeamFixtures(supabase, dailyGameId, userId) {
  if (!dailyGameId || !userId) return []

  const fixturesResult = await supabase
    .from('daily_game_fixtures')
    .select('id, round_number, fixtures(match_date, home_team, away_team, full_time_home_goals, full_time_away_goals)')
    .eq('daily_game_id', dailyGameId)
    .order('round_number')

  if (fixturesResult.error) throw fixturesResult.error

  const fixtureIds = (fixturesResult.data || []).map((row) => row.id)
  if (!fixtureIds.length) return []

  const predictionsResult = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', userId)
    .in('daily_game_fixture_id', fixtureIds)

  if (predictionsResult.error) throw predictionsResult.error

  const predictions = new Map((predictionsResult.data || []).map((row) => [row.daily_game_fixture_id, row]))

  return (fixturesResult.data || []).map((round) => {
    const prediction = predictions.get(round.id)
    const fixture = round.fixtures || {}
    return {
      roundNumber: Number(round.round_number || 0),
      fixtureDate: fixture.match_date,
      homeTeam: fixture.home_team,
      awayTeam: fixture.away_team,
      actualScore: scoreText(fixture.full_time_home_goals, fixture.full_time_away_goals),
      predictedScore: prediction ? scoreText(prediction.predicted_home_goals, prediction.predicted_away_goals) : '-',
      points: Number(prediction?.points || 0),
      resultCode: prediction ? predictionCode(prediction) : '-',
      isAuto: prediction?.is_auto === true,
    }
  }).filter((round) => round.predictedScore !== '-')
}

export async function handler(event) {
  try {
    const supabase = getSupabase()
    await getUser(event, supabase)

    const selectedGameId = event.queryStringParameters?.dailyGameId || ''
    const selectedUserId = event.queryStringParameters?.userId || ''

    const gamesResult = await supabase
      .from('daily_games')
      .select('id, game_date, country, competition, league_name, winner_user_id, closed_at, seasons(display_name, code)')
      .eq('status', 'closed')
      .order('game_date', { ascending: false })
      .limit(60)

    if (gamesResult.error) throw gamesResult.error

    const games = gamesResult.data || []
    const gameIds = games.map((game) => game.id)
    if (!gameIds.length) return json(200, { leagues: [], seasons: [], teamFixtures: [] })

    const resultsResult = await supabase
      .from('daily_results')
      .select('*')
      .in('daily_game_id', gameIds)
      .order('rank')

    if (resultsResult.error) throw resultsResult.error

    const userIds = [...new Set((resultsResult.data || []).map((row) => row.user_id))]
    const profilesResult = userIds.length
      ? await supabase.from('user_profiles').select('user_id, email, username, club_name, badge_url').in('user_id', userIds)
      : { data: [], error: null }

    if (profilesResult.error) throw profilesResult.error

    const profiles = new Map((profilesResult.data || []).map((row) => [row.user_id, row]))
    const resultsByGame = new Map()

    for (const row of resultsResult.data || []) {
      if (!resultsByGame.has(row.daily_game_id)) resultsByGame.set(row.daily_game_id, [])
      resultsByGame.get(row.daily_game_id).push(row)
    }

    const leaguesMap = new Map()
    for (const game of games) {
      const key = `${game.country}:${game.competition}`
      if (!leaguesMap.has(key)) {
        leaguesMap.set(key, {
          key,
          country: game.country,
          competition: game.competition,
          leagueName: game.league_name,
          seasonCount: 0,
        })
      }
      leaguesMap.get(key).seasonCount += 1
    }

    const seasons = games.map((game) => {
      const rows = resultsByGame.get(game.id) || []
      const tiersMap = new Map()

      for (const row of rows) {
        const level = Number(row.pyramid_level_before || 1)
        if (!tiersMap.has(level)) tiersMap.set(level, [])
        const profileRow = profiles.get(row.user_id)
        tiersMap.get(level).push({
          userId: row.user_id,
          clubName: displayName(profileRow),
          badgeUrl: profileRow?.badge_url || '',
          rank: Number(row.rank || 0),
          totalPoints: Number(row.total_points || 0),
          exactScores: Number(row.correct_scores || 0),
          correctResults: Number(row.correct_results || 0),
          movement: row.movement || 'stayed',
          status: movementLabel(row),
          statusClass: statusClass(row),
        })
      }

      const tiers = [...tiersMap.entries()].sort((a, b) => a[0] - b[0]).map(([level, tierRows]) => {
        const sortedRows = tierRows.sort((a, b) => a.rank - b.rank)
        return {
          level,
          name: tierName(level),
          champion: sortedRows.find((row) => row.rank === 1) || null,
          promoted: sortedRows.filter((row) => row.movement === 'promoted'),
          relegated: sortedRows.filter((row) => row.movement === 'relegated'),
          rows: sortedRows,
        }
      })

      return {
        id: game.id,
        gameDate: game.game_date,
        country: game.country,
        competition: game.competition,
        leagueKey: `${game.country}:${game.competition}`,
        leagueName: game.league_name,
        seasonLabel: seasonLabel(game),
        closedAt: game.closed_at,
        tiers,
      }
    })

    const teamFixtures = selectedGameId && selectedUserId
      ? await loadTeamFixtures(supabase, selectedGameId, selectedUserId)
      : []

    return json(200, {
      leagues: [...leaguesMap.values()].sort((a, b) => a.country.localeCompare(b.country) || a.leagueName.localeCompare(b.leagueName)),
      seasons,
      teamFixtures,
    })
  } catch (error) {
    return json(500, { error: error.message || 'Could not load previous seasons archive' })
  }
}
