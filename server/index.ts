import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { warmCache, getWarmupProgress, getAllFeatures, getAllNames, getAllTypeNames, SPRITES_DIR } from './cache';
import { db, stmts } from './db';
import pickerDb, { pickerStmts, weightsToVector } from './picker-db';
import { runClustering, shouldRunClustering } from './clustering';
import type { FeatureWeights } from '../src/types';
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

// ─── Picker: session & weight sync ────────────────────────────────────────

app.post('/session', async (c) => {
  const body = await c.req.json<{ sessionId: string }>();
  if (!body.sessionId) return c.json({ error: 'missing sessionId' }, 400);

  const result = pickerStmts.upsertSession.run({ id: body.sessionId, weights: '{}' });
  return c.json({ created: result.changes > 0 });
});

app.put('/session/:id/weights', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    weights: FeatureWeights;
    interactionCount: number;
    completed: boolean;
  }>();

  if (!body.weights) return c.json({ error: 'missing weights' }, 400);

  // Update relational row
  pickerStmts.updateWeights.run({
    id,
    weights: JSON.stringify(body.weights),
    interaction_count: body.interactionCount,
    completed: body.completed ? 1 : 0,
  });

  // Upsert vector for similarity search (delete + insert in transaction)
  const embedding = weightsToVector(body.weights);
  const upsertVec = pickerDb.transaction(() => {
    pickerDb.prepare('DELETE FROM weight_vectors WHERE session_id = ?').run(id);
    pickerDb.prepare('INSERT INTO weight_vectors (session_id, embedding) VALUES (?, ?)').run(id, embedding);
  });
  upsertVec();

  // Auto-trigger clustering when completed sessions hit a multiple of 10
  if (body.completed && shouldRunClustering()) {
    try { runClustering(); } catch { /* non-fatal */ }
  }

  return c.json({ ok: true });
});

app.get('/clusters', (c) => {
  type CentroidRow = { id: number; updated_at: number; centroid: string; member_count: number; label: string | null };
  const rows = pickerStmts.getAllCentroids.all() as CentroidRow[];
  if (rows.length === 0) return c.json({ error: 'no clusters' }, 404);

  const parsed = rows.map((r) => ({
    id: r.id,
    updated_at: r.updated_at,
    centroid: JSON.parse(r.centroid) as FeatureWeights,
    member_count: r.member_count,
    label: r.label,
  }));

  return c.json(parsed, 200, { 'Cache-Control': 'max-age=86400' });
});

app.post('/cluster', (c) => {
  const result = runClustering();
  return c.json(result);
});

// ─── Start ────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3001', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`PokéPicker server → http://localhost:${port}`);
  warmCache().then(() => console.log('Cache warm-up complete.')).catch(console.error);
});
