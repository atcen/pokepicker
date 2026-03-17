import type { SortResult } from '../types';

export async function recordSortResult(
  result: SortResult,
  sessionId: string
): Promise<void> {
  try {
    await fetch('/api/stats/sort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        timestamp: result.timestamp,
        rankedIds: result.rankedIds,
      }),
    });
  } catch (e) {
    console.warn('Stats recording failed:', e);
  }
}

export async function getMostChosen(limit = 10): Promise<number[]> {
  try {
    const res = await fetch(`/api/stats/top?n=${limit}`);
    const data = await res.json() as { top: { id: number; wins: number }[] };
    return data.top.map((r) => r.id);
  } catch {
    return [];
  }
}
