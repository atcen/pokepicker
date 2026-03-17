import type { AppState, PokemonFeatures, Rating, SortResult } from '../types';
import { fetchAllPokemon } from '../data/pokeapi';
import { DEFAULT_WEIGHTS, computePrior } from '../rating/prior';
import { updateRatingsFromSort } from '../rating/elo';
import { updateWeights, detectOutliers } from '../rating/weights';
import { selectNextBatch, isRankingSettled } from '../rating/pairing';
import { SortBatchUI } from './sorter';
import { RankingUI } from './ranking';
import { recordSortResult } from '../stats/db';
import { CONFIG } from '../config';

const STATE_KEY = 'pokepicker-state';
const SESSION_ID = generateSessionId();

function generateSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export class App {
  private state: AppState | null = null;
  private allPokemon: Record<number, PokemonFeatures> = {};
  private recentBatchIds: number[] = [];
  private outliers: number[] = [];

  private sorterUI: SortBatchUI | null = null;
  private rankingUI: RankingUI | null = null;

  private sorterContainer!: HTMLElement;
  private rankingContainer!: HTMLElement;
  private statsEl!: HTMLElement;
  private progressContainer!: HTMLElement;

  async init(): Promise<void> {
    this.sorterContainer = document.getElementById('sorter-container')!;
    this.rankingContainer = document.getElementById('ranking-container')!;
    this.statsEl = document.getElementById('stats-bar')!;
    this.progressContainer = document.getElementById('progress-container')!;

    const undoBtn = document.getElementById('undo-btn');
    undoBtn?.addEventListener('click', () => this.handleUndo());

    const resetBtn = document.getElementById('reset-btn');
    resetBtn?.addEventListener('click', () => this.handleReset());

    // Setup ranking UI
    this.rankingUI = new RankingUI(this.rankingContainer);

    // Load existing state
    const savedState = loadState();

    if (savedState && Object.keys(savedState.ratings).length > 0) {
      this.state = savedState;
      this.showWelcomeBack();
      await this.loadPokemonData();
      this.startSortLoop();
    } else {
      await this.loadPokemonData();
      this.initFreshState();
      this.startSortLoop();
    }
  }

  private showWelcomeBack(): void {
    const banner = document.createElement('div');
    banner.className = 'welcome-back-banner';
    banner.textContent = 'Willkommen zurück! Dein Fortschritt wurde wiederhergestellt.';
    document.body.prepend(banner);
    setTimeout(() => banner.remove(), 4000);
  }

  private async loadPokemonData(): Promise<void> {
    this.progressContainer.style.display = 'flex';

    const progressBar = document.getElementById('progress-bar')!;
    const progressText = document.getElementById('progress-text')!;

    try {
      const pokemonList = await fetchAllPokemon((loaded, total) => {
        const pct = Math.round((loaded / total) * 100);
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `Lade Pokémon... ${loaded}/${total}`;
      });

      for (const pkm of pokemonList) {
        this.allPokemon[pkm.id] = pkm;
      }
    } finally {
      this.progressContainer.style.display = 'none';
    }
  }

  private initFreshState(): void {
    const ratings: Record<number, Rating> = {};

    for (const pkm of Object.values(this.allPokemon)) {
      const prior = computePrior(pkm, DEFAULT_WEIGHTS);
      ratings[pkm.id] = {
        pokemonId: pkm.id,
        mu: prior,
        sigma: CONFIG.INITIAL_SIGMA,
        comparisons: 0,
      };
    }

    this.state = {
      ratings,
      weights: DEFAULT_WEIGHTS,
      history: [],
      totalInteractions: 0,
      startedAt: Date.now(),
    };

    saveState(this.state);
  }

  private startSortLoop(): void {
    this.renderNextBatch();
  }

  private renderNextBatch(): void {
    if (!this.state) return;

    const batchIds = selectNextBatch(
      this.state.ratings,
      this.allPokemon,
      this.outliers,
      CONFIG.BATCH_SIZE,
      this.recentBatchIds
    );

    this.recentBatchIds = [...batchIds, ...this.recentBatchIds].slice(0, CONFIG.BATCH_SIZE * 2);

    const batchPokemon = batchIds
      .map((id) => this.allPokemon[id])
      .filter(Boolean);

    if (this.sorterUI) {
      this.sorterUI.destroy();
    }

    this.sorterUI = new SortBatchUI(
      this.sorterContainer,
      (rankedIds) => this.handleSort(rankedIds),
      () => this.handleSkip()
    );

    this.sorterUI.render(batchPokemon);

    // Update ranking display
    const settledInfo = isRankingSettled(this.state.ratings, CONFIG.SETTLED_TOP_N);
    this.rankingUI!.update(this.state.ratings, this.allPokemon, settledInfo);

    this.updateStats();
  }

  private async handleSort(rankedIds: number[]): Promise<void> {
    if (!this.state) return;

    const result: SortResult = {
      timestamp: Date.now(),
      rankedIds,
    };

    // Update ratings
    const newRatings = updateRatingsFromSort(rankedIds, this.state.ratings);

    // Update weights
    const newWeights = updateWeights(result, this.allPokemon, newRatings, this.state.weights);

    // Detect outliers
    this.outliers = detectOutliers(newRatings, this.allPokemon, newWeights);

    // Update history (for undo)
    const history = [result, ...this.state.history].slice(0, CONFIG.HISTORY_LENGTH);

    this.state = {
      ...this.state,
      ratings: newRatings,
      weights: newWeights,
      history,
      totalInteractions: this.state.totalInteractions + 1,
    };

    saveState(this.state);

    // Record stats in background
    recordSortResult(result, SESSION_ID).catch(() => {});

    this.renderNextBatch();
  }

  private handleSkip(): void {
    this.renderNextBatch();
  }

  private handleUndo(): void {
    if (!this.state || this.state.history.length === 0) {
      alert('Kein Undo-Schritt verfügbar.');
      return;
    }

    const [_lastResult, ...remainingHistory] = this.state.history;

    // Re-compute ratings from remaining history
    // Start from scratch with priors
    const ratings: Record<number, Rating> = {};
    for (const pkm of Object.values(this.allPokemon)) {
      const prior = computePrior(pkm, this.state.weights);
      ratings[pkm.id] = {
        pokemonId: pkm.id,
        mu: prior,
        sigma: CONFIG.INITIAL_SIGMA,
        comparisons: 0,
      };
    }

    let currentRatings = ratings;
    for (const result of [...remainingHistory].reverse()) {
      currentRatings = updateRatingsFromSort(result.rankedIds, currentRatings);
    }

    this.state = {
      ...this.state,
      ratings: currentRatings,
      history: remainingHistory,
      totalInteractions: Math.max(0, this.state.totalInteractions - 1),
    };

    saveState(this.state);
    this.renderNextBatch();
  }

  private handleReset(): void {
    if (!confirm('Wirklich alles zurücksetzen? Dein Fortschritt geht verloren.')) return;
    localStorage.removeItem(STATE_KEY);
    this.state = null;
    this.recentBatchIds = [];
    this.outliers = [];
    this.initFreshState();
    this.startSortLoop();
  }

  private updateStats(): void {
    if (!this.state) return;

    const elapsed = Math.round((Date.now() - this.state.startedAt) / 60000);
    const settledInfo = isRankingSettled(this.state.ratings, CONFIG.SETTLED_TOP_N);
    const confidence = Math.round(settledInfo.confidence * 100);

    this.statsEl.textContent =
      `${this.state.totalInteractions} Interaktionen · ${elapsed} Min · ` +
      `Top ${CONFIG.SETTLED_TOP_N}: ${confidence}% Konfidenz`;
  }
}
