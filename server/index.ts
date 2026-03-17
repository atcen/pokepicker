import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { warmCache, getWarmupProgress, getAllFeatures, getAllNames, getAllTypeNames, SPRITES_DIR } from './cache';
import { db, stmts } from './db';
import fs from 'fs';
import path from 'path';

const app = new Hono();
app.use('*', cors());

// ─── PokeAPI cache ────────────────────────────────────────────────────────

app.get('/api/pokemon', (c) => {
  const progress = getWarmupProgress();
  return c.json({
    pokemon: getAllFeatures(),
    names: getAllNames(),
    typeNames: getAllTypeNames(),
    complete: progress.done >= progress.total,
    cached: progress.done,
    total: progress.total,
  });
});

app.get('/api/status', (c) => {
  const p = getWarmupProgress();
  return c.json({ cached: p.done, total: p.total, complete: p.done >= p.total });
});

// ─── Sprite serving ───────────────────────────────────────────────────────

app.get('/sprites/:id', (c) => {
  const id = c.req.param('id').replace(/[^0-9]/g, '');
  const filePath = path.join(SPRITES_DIR, `${id}.png`);
  if (!fs.existsSync(filePath)) return c.notFound();
  const data = fs.readFileSync(filePath);
  return new Response(data, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// ─── Cross-user stats ─────────────────────────────────────────────────────

/** Record a sort result from a user session */
app.post('/api/stats/sort', async (c) => {
  const body = await c.req.json<{
    sessionId: string;
    timestamp: number;
    rankedIds: number[];
  }>();

  if (!body.sessionId || !Array.isArray(body.rankedIds) || body.rankedIds.length < 2) {
    return c.json({ error: 'invalid' }, 400);
  }

  // Insert event + pairwise wins in a single transaction
  const insertAll = db.transaction(() => {
    stmts.insertSortEvent.run({
      session_id: body.sessionId,
      timestamp: body.timestamp,
      ranked_ids: JSON.stringify(body.rankedIds),
      batch_size: body.rankedIds.length,
    });

    for (let i = 0; i < body.rankedIds.length; i++) {
      for (let j = i + 1; j < body.rankedIds.length; j++) {
        stmts.upsertPairwiseWin.run({
          winner_id: body.rankedIds[i],
          loser_id: body.rankedIds[j],
        });
      }
    }
  });
  insertAll();

  return c.json({ ok: true });
});

/** Top N most-chosen Pokémon across all users */
app.get('/api/stats/top', (c) => {
  const n = Math.min(parseInt(c.req.query('n') ?? '50', 10), 200);
  const rows = stmts.topWinners.all(n) as { id: number; wins: number }[];
  return c.json({ top: rows });
});

/** Global summary */
app.get('/api/stats/summary', (c) => {
  const events = (stmts.totalSortEvents.get() as { n: number }).n;
  const sessions = (stmts.totalUniqueSessions.get() as { n: number }).n;
  return c.json({ totalSortEvents: events, uniqueSessions: sessions });
});

// ─── Start ────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3001', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`PokéPicker server → http://localhost:${port}`);
  warmCache().then(() => console.log('Cache warm-up complete.')).catch(console.error);
});
