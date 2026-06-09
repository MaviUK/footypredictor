import { getSupabase, getUser, json } from './_gameHelpers.js'

function tierSize(level) {
  return Number(level) === 1 ? 20 : 24
}

function tierLabel(level, fallback) {
  if (fallback) return fallback
  if (Number(level) === 1) return 'Premier League'
  if (Number(level) === 2) return 'Championship'
  if (Number(level) === 3) return 'League 1'
  if (Number(level) === 4) return 'League 2'
  if (Number(level) === 5) return 'National League'
  return `National League ${Number(level) - 4}`
}

export async function handler(event) {
  try {
    const supabase = getSupabase()
    await getUser(event, supabase)

    const profilesResult = await supabase
      .from('user_profiles')
      .select('user_id, email, username, club_name, badge_url, country, competition, league_name, pyramid_level, tier_name, tier_slot')
      .not('tier_slot', 'is', null)
      .order('country')
      .order('competition')
      .order('pyramid_level')
      .order('tier_slot')

    if (profilesResult.error) throw profilesResult.error

    const leagueMap = new Map()

    for (const profile of profilesResult.data || []) {
      const leagueKey = `${profile.country || 'Unknown'}:${profile.competition || 'Unknown'}`
      if (!leagueMap.has(leagueKey)) {
        leagueMap.set(leagueKey, {
          country: profile.country || 'Unknown',
          competition: profile.competition || 'Unknown',
          leagueName: profile.league_name || profile.competition || 'League',
          tiers: new Map(),
        })
      }

      const league = leagueMap.get(leagueKey)
      const level = Number(profile.pyramid_level || 1)
      if (!league.tiers.has(level)) {
        league.tiers.set(level, {
          level,
          name: tierLabel(level, profile.tier_name),
          size: tierSize(level),
          teams: [],
        })
      }

      league.tiers.get(level).teams.push({
        userId: profile.user_id,
        slot: profile.tier_slot,
        name: profile.club_name || profile.username || profile.email || 'Club',
        username: profile.username,
        badgeUrl: profile.badge_url || '',
      })
    }

    const leagues = [...leagueMap.values()].map((league) => ({
      country: league.country,
      competition: league.competition,
      leagueName: league.leagueName,
      totalTeams: [...league.tiers.values()].reduce((sum, tier) => sum + tier.teams.length, 0),
      tiers: [...league.tiers.values()].sort((a, b) => a.level - b.level),
    })).sort((a, b) => a.country.localeCompare(b.country) || a.leagueName.localeCompare(b.leagueName))

    return json(200, { leagues })
  } catch (error) {
    return json(500, { error: error.message || 'Could not load league explorer' })
  }
}
