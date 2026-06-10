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

export async function handler(event) {
  try {
    const supabase = getSupabase()
    const user = await getUser(event, supabase)

    const profileResult = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileResult.error) throw profileResult.error
    if (!profileResult.data) return json(404, { error: 'Profile not found' })

    const profile = profileResult.data
    const gamesResult = await supabase
      .from('daily_games')
      .select('id, game_date, country, competition, league_name, winner_user_id, closed_at, seasons(display_name, code)')
      .eq('country', profile.country)
      .eq('competition', profile.competition)
      .eq('status', 'closed')
      .order('game_date', { ascending: false })
      .limit(30)

    if (gamesResult.error) throw gamesResult.error

    const games = gamesResult.data || []
    const gameIds = games.map((game) => game.id)
    if (!gameIds.length) return json(200, { seasons: [] })

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
        leagueName: game.league_name,
        seasonLabel: seasonLabel(game),
        closedAt: game.closed_at,
        tiers,
        myResult: rows.find((row) => row.user_id === user.id) || null,
      }
    })

    return json(200, { seasons })
  } catch (error) {
    return json(500, { error: error.message || 'Could not load previous seasons archive' })
  }
}
