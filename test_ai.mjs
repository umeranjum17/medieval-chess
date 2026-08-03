// Smallest thing that fails if the search or eval breaks.
//   node test_ai.mjs
import { Chess } from 'chess.js';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// pull the pure logic out of main.js without booting three.js
const src = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const slice = src.slice(src.indexOf('const VAL ='), src.indexOf('// ---------- interaction'));
const { evaluate, bestMove } = await import(
  'data:text/javascript,' + encodeURIComponent(slice + '\nexport { evaluate, bestMove, search };')
);

// 1. eval is symmetric on the start position
assert.strictEqual(evaluate(new Chess()), 0, 'start position must score 0');

// 2. eval signs: white up a queen is positive, black up a queen is negative
assert.ok(evaluate(new Chess('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')) > 800, 'white +Q must be positive');
assert.ok(evaluate(new Chess('3qk3/8/8/8/8/8/8/4K3 w - - 0 1')) < -800, 'black +Q must be negative');

// 3. mate in one — back rank
{
  const g = new Chess('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  const m = bestMove(g, 3);
  g.move(m);
  assert.ok(g.isCheckmate(), `expected mate in 1, got ${m.san}`);
}

// 4. takes the free queen instead of drifting
{
  const g = new Chess('4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1');
  const m = bestMove(g, 2);
  assert.strictEqual(m.captured, 'q', `expected QxB capture, got ${m.san}`);
}

// 5. avoids stalemating when a mate is available (eval must rank mate above draw)
{
  const g = new Chess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
  const m = bestMove(g, 3);
  g.move(m);
  assert.ok(!g.isStalemate(), `blundered into stalemate with ${m.san}`);
}

// 6. every depth returns a legal move and terminates
for (const d of [2, 3, 4]) {
  const g = new Chess();
  const t = Date.now();
  const m = bestMove(g, d);
  assert.ok(g.moves({ verbose: true }).some(x => x.san === m.san), `depth ${d} returned illegal move`);
  console.log(`  depth ${d}: ${m.san} in ${Date.now() - t}ms`);
}

console.log('all AI checks passed');
