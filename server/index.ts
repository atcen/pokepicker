import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { warmCache, getWarmupProgress, getAllFeatures, getAllNames, getAllTypeNames } from './cache';

const app = new Hono();
app.use('*', cors());

/** Returns all cached Pokémon features + localized names */
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

/** Warmup progress */
app.get('/api/status', (c) => {
  const p = getWarmupProgress();
  return c.json({ cached: p.done, total: p.total, complete: p.done >= p.total });
});

const port = parseInt(process.env.PORT ?? '3001', 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`PokéPicker cache server → http://localhost:${port}`);
  warmCache().then(() => {
    console.log('Cache warm-up complete.');
  }).catch(console.error);
});
