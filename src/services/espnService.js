/**
 * ESPN Service - Fetches player data from ESPN Fantasy Football public APIs
 * Currently using mock data; can be extended with real ESPN API calls
 */

class ESPNService {
  /**
   * Generate mock player data for testing
   */
  static getMockPlayers() {
    const mockData = [
      // QBs
      {
        espn_id: 'qb-1',
        name: 'Patrick Mahomes',
        position: 'QB',
        team: 'KC',
        nfl_team: 'Kansas City Chiefs',
        bye_week: 6,
        adp: 12,
        adp_floor: 8,
        adp_ceiling: 18,
        projected_points: 28.5,
      },
      {
        espn_id: 'qb-2',
        name: 'Josh Allen',
        position: 'QB',
        team: 'BUF',
        nfl_team: 'Buffalo Bills',
        bye_week: 9,
        adp: 18,
        adp_floor: 14,
        adp_ceiling: 25,
        projected_points: 27.2,
      },
      {
        espn_id: 'qb-3',
        name: 'Lamar Jackson',
        position: 'QB',
        team: 'BAL',
        nfl_team: 'Baltimore Ravens',
        bye_week: 14,
        adp: 22,
        adp_floor: 16,
        adp_ceiling: 32,
        projected_points: 26.8,
      },

      // RBs
      {
        espn_id: 'rb-1',
        name: 'Christian McCaffrey',
        position: 'RB',
        team: 'SF',
        nfl_team: 'San Francisco 49ers',
        bye_week: 10,
        adp: 5,
        adp_floor: 2,
        adp_ceiling: 10,
        projected_points: 24.3,
      },
      {
        espn_id: 'rb-2',
        name: 'Derrick Henry',
        position: 'RB',
        team: 'TEN',
        nfl_team: 'Tennessee Titans',
        bye_week: 8,
        adp: 8,
        adp_floor: 4,
        adp_ceiling: 15,
        projected_points: 22.1,
      },
      {
        espn_id: 'rb-3',
        name: 'Saquon Barkley',
        position: 'RB',
        team: 'PHI',
        nfl_team: 'Philadelphia Eagles',
        bye_week: 12,
        adp: 11,
        adp_floor: 6,
        adp_ceiling: 18,
        projected_points: 21.7,
      },
      {
        espn_id: 'rb-4',
        name: 'Travis Etienne Jr.',
        position: 'RB',
        team: 'JAX',
        nfl_team: 'Jacksonville Jaguars',
        bye_week: 7,
        adp: 16,
        adp_floor: 10,
        adp_ceiling: 25,
        projected_points: 19.8,
      },

      // WRs
      {
        espn_id: 'wr-1',
        name: 'Tyreek Hill',
        position: 'WR',
        team: 'MIA',
        nfl_team: 'Miami Dolphins',
        bye_week: 5,
        adp: 4,
        adp_floor: 1,
        adp_ceiling: 10,
        projected_points: 25.6,
      },
      {
        espn_id: 'wr-2',
        name: 'Justin Jefferson',
        position: 'WR',
        team: 'MIN',
        nfl_team: 'Minnesota Vikings',
        bye_week: 11,
        adp: 6,
        adp_floor: 2,
        adp_ceiling: 12,
        projected_points: 24.2,
      },
      {
        espn_id: 'wr-3',
        name: 'Stefon Diggs',
        position: 'WR',
        team: 'BUF',
        nfl_team: 'Buffalo Bills',
        bye_week: 9,
        adp: 9,
        adp_floor: 5,
        adp_ceiling: 16,
        projected_points: 23.1,
      },
      {
        espn_id: 'wr-4',
        name: 'CeeDee Lamb',
        position: 'WR',
        team: 'DAL',
        nfl_team: 'Dallas Cowboys',
        bye_week: 7,
        adp: 13,
        adp_floor: 7,
        adp_ceiling: 20,
        projected_points: 22.4,
      },

      // TEs
      {
        espn_id: 'te-1',
        name: 'Travis Kelce',
        position: 'TE',
        team: 'KC',
        nfl_team: 'Kansas City Chiefs',
        bye_week: 6,
        adp: 7,
        adp_floor: 3,
        adp_ceiling: 14,
        projected_points: 21.8,
      },
      {
        espn_id: 'te-2',
        name: 'Mark Andrews',
        position: 'TE',
        team: 'BAL',
        nfl_team: 'Baltimore Ravens',
        bye_week: 14,
        adp: 19,
        adp_floor: 12,
        adp_ceiling: 28,
        projected_points: 17.2,
      },

      // K
      {
        espn_id: 'k-1',
        name: 'Harrison Butker',
        position: 'K',
        team: 'KC',
        nfl_team: 'Kansas City Chiefs',
        bye_week: 6,
        adp: 72,
        adp_floor: 60,
        adp_ceiling: 90,
        projected_points: 11.2,
      },

      // DEF
      {
        espn_id: 'def-1',
        name: 'San Francisco 49ers',
        position: 'DEF',
        team: 'SF',
        nfl_team: 'San Francisco 49ers',
        bye_week: 10,
        adp: 42,
        adp_floor: 30,
        adp_ceiling: 60,
        projected_points: 9.5,
      },
    ];

    return mockData;
  }

  /**
   * Fetch players from ESPN API (placeholder)
   * In production, this would make real API calls
   */
  static async fetchPlayersFromESPN() {
    // TODO: Implement real ESPN API fetching
    // For now, return mock data
    return this.getMockPlayers();
  }

  /**
   * Fetch ADP data from alternative sources
   */
  static async fetchADPData() {
    // TODO: Implement Sleeper API or other ADP sources
    const players = this.getMockPlayers();
    const adpMap = {};

    players.forEach((player) => {
      if (player.adp) {
        adpMap[player.espn_id] = player.adp;
      }
    });

    return adpMap;
  }
}

module.exports = ESPNService;
