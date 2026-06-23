const RankingEngine = require('./rankingEngine');

// Mock player data
const mockPlayers = [
  {
    id: 1,
    name: 'Player A',
    position: 'WR',
    adp: 15,
    projected_points: 25,
  },
  {
    id: 2,
    name: 'Player B',
    position: 'WR',
    adp: 25,
    projected_points: 20,
  },
  {
    id: 3,
    name: 'Player C',
    position: 'RB',
    adp: 10,
    projected_points: 22,
  },
  {
    id: 4,
    name: 'Player D',
    position: 'QB',
    adp: 50,
    projected_points: 25,
  },
  {
    id: 5,
    name: 'Player E',
    position: 'TE',
    adp: 35,
    projected_points: 18,
  },
];

console.log('=== Ranking Engine Tests ===\n');

// Test 1: Default ranking
console.log('Test 1: Default ranking with default weights');
const defaultRanked = RankingEngine.rankPlayers(mockPlayers);
console.log(
  defaultRanked.map((p) => `${p.rank}. ${p.name} (${p.position}) - Score: ${p.score}`)
);
console.log();

// Test 2: ADP-focused ranking
console.log('Test 2: ADP-focused ranking');
const adpFocused = RankingEngine.rankPlayers(mockPlayers, {
  adpWeight: 0.8,
  projectionWeight: 0.1,
  positionScarcityWeight: 0.1,
});
console.log(
  adpFocused.map((p) => `${p.rank}. ${p.name} (${p.position}) - Score: ${p.score}`)
);
console.log();

// Test 3: Projection-focused ranking
console.log('Test 3: Projection-focused ranking');
const projectionFocused = RankingEngine.rankPlayers(mockPlayers, {
  adpWeight: 0.1,
  projectionWeight: 0.8,
  positionScarcityWeight: 0.1,
});
console.log(
  projectionFocused.map((p) => `${p.rank}. ${p.name} (${p.position}) - Score: ${p.score}`)
);
console.log();

// Test 4: Grouped by position
console.log('Test 4: Grouped by position');
const grouped = RankingEngine.rankPlayers(mockPlayers, {}, { groupBy: 'position' });
Object.entries(grouped).forEach(([position, players]) => {
  console.log(`\n${position}:`);
  console.log(players.map((p) => `  ${p.rank}. ${p.name} - Score: ${p.score}`).join('\n'));
});
console.log();

// Test 5: Strategy comparison
console.log('Test 5: Strategy comparison');
const strategies = [
  {
    name: 'Balanced',
    weights: { adpWeight: 0.4, projectionWeight: 0.5, positionScarcityWeight: 0.1 },
  },
  {
    name: 'ADP Heavy',
    weights: { adpWeight: 0.7, projectionWeight: 0.2, positionScarcityWeight: 0.1 },
  },
  {
    name: 'Projection Heavy',
    weights: { adpWeight: 0.2, projectionWeight: 0.7, positionScarcityWeight: 0.1 },
  },
];
const comparison = RankingEngine.compareStrategies(mockPlayers, strategies);
Object.entries(comparison).forEach(([strategyName, results]) => {
  console.log(`\n${strategyName}:`);
  if (Array.isArray(results)) {
    console.log(
      results.map((p) => `  ${p.rank}. ${p.name} (${p.position}) - Score: ${p.score}`).join('\n')
    );
  } else {
    Object.entries(results).forEach(([pos, players]) => {
      console.log(`  ${pos}: ${players.map((p) => p.name).join(', ')}`);
    });
  }
});

console.log('\n=== Tests Complete ===');
