import type { ClusterCentroidRow, FeatureWeights } from '../types';

const BASE_URL = 'http://localhost:3001';

/** Create or confirm a session in the backend. Returns false on any error. */
export async function initSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[backend] initSession failed:', e);
    return false;
  }
}

/** Push current weights to the backend. Returns false on any error. */
export async function syncWeights(
  sessionId: string,
  weights: FeatureWeights,
  interactionCount: number,
  completed: boolean
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/session/${sessionId}/weights`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights, interactionCount, completed }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[backend] syncWeights failed:', e);
    return false;
  }
}

/** Fetch cluster centroids from the backend. Returns null if unavailable. */
export async function fetchClusters(): Promise<ClusterCentroidRow[] | null> {
  try {
    const res = await fetch(`${BASE_URL}/clusters`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as ClusterCentroidRow[];
  } catch (e) {
    console.warn('[backend] fetchClusters failed:', e);
    return null;
  }
}
