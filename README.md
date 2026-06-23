# Fantasy Football Backend

A Node.js/Express backend for fantasy football draft strategy analysis and player ranking algorithms.

## Features

- **Ranking Engine**: Advanced scoring algorithm combining ADP, projections, and position scarcity
- **Multiple Strategies**: Pre-configured ranking strategies (Balanced, ADP-Heavy, Projection-Heavy, Value-Focused)
- **Custom Algorithms**: Test custom weight combinations in real-time
- **Mock Data**: Pre-loaded with 15+ fantasy football players for testing

## Quick Start

### Setup

```bash
npm install
cp .env.example .env
```

### Run

```bash
npm start
```

Backend will start on `http://localhost:3001`

## API Endpoints

### Players

- `GET /api/players` - Get all ranked players
  - Query params: `position`, `weights` (JSON), `limit`
  - Example: `/api/players?position=WR&limit=10`

- `GET /api/players/:id` - Get specific player

### Rankings

- `GET /api/rankings` - Get pre-computed rankings
  - Query params: `strategy` (balanced|adpHeavy|projectionHeavy|valueHeavy), `groupBy`
  - Example: `/api/rankings?strategy=adpHeavy`

- `GET /api/rankings/strategies` - List available strategies

### Algorithms

- `POST /api/algorithms/test` - Test custom algorithm
  ```json
  {
    "weights": { "adpWeight": 0.4, "projectionWeight": 0.5, "positionScarcityWeight": 0.1 },
    "position": "WR",
    "limit": 20
  }
  ```

- `POST /api/algorithms/compare` - Compare multiple strategies

## Ranking Algorithm

The ranking engine combines three factors:

1. **ADP (Average Draft Position)** - Market consensus
2. **Projected Points** - Fantasy points output
3. **Position Scarcity** - Top player depth at position

Each factor is weighted (default: 0.4, 0.5, 0.1) to create a final score.

### Strategies

- **Balanced** (0.4, 0.5, 0.1): Default approach
- **ADP Heavy** (0.7, 0.2, 0.1): Trust market consensus
- **Projection Heavy** (0.2, 0.7, 0.1): Emphasize high output
- **Value Focused** (0.3, 0.3, 0.4): Prioritize position scarcity

## Project Structure

```
src/
  server.js              - Express app setup
  routes/
    players.js           - Player endpoints
    rankings.js          - Ranking endpoints
    algorithms.js        - Algorithm testing
  services/
    rankingEngine.js     - Core ranking algorithm
    espnService.js       - ESPN data fetching (mock/real)
  db/
    schema.sql           - PostgreSQL schema (future)
    connection.js        - DB connection (future)
```

## Next Steps

- [ ] Connect real PostgreSQL database
- [ ] Integrate ESPN API for real player data
- [ ] Add historical ADP tracking
- [ ] Implement background data sync
- [ ] Add authentication for saved strategies

## Development

Run tests:
```bash
node src/services/rankingEngine.test.js
```

## License

MIT
