import type { AppState, PairingMode, PokemonFeatures, Rating, SortResult } from '../types';
import { fetchAllPokemon } from '../data/pokeapi';
import { DEFAULT_WEIGHTS, computePrior } from '../rating/prior';
import { updateRatingsFromSort } from '../rating/elo';
import { updateWeightsAndPropagate, detectOutliers } from '../rating/weights';
import { selectNextBatch, computeConfidence, recommendMode } from '../rating/pairing';
import { ONBOARDING_BATCHES, ONBOARDING_COUNT, MIXED_MODE_START_INDEX } from '../data/onboarding';
import { SortBatchUI } from './sorter';
import { RankingUI } from './ranking';
import { recordSortResult } from '../stats/db';
import { SUPPORTED_LANGUAGES, currentLanguage, setLanguage } from '../data/i18n';
import { CONFIG } from '../config';

const STATE_KEY = 'pokepicker-state';
const SESSION_ID = generateSessionId();
const WEIGHT_HISTORY_MAX = 5;

function generateSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as AppState;
    // Migrate old saves that lack the new fields
    if (state.onboardingComplete === undefined) state.onboardingComplete = true;
    if (state.onboardingIndex === undefined) state.onboardingIndex = ONBOARDING_COUNT;
    if (state.weightHistory === undefined) state.weightHistory = [];
    if (state.pairingMode === undefined) state.pairingMode = 'exploration';
    if (state.modeAutoSwitch === undefined) state.modeAutoSwitch = true;
    return state;
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
  private modeBarEl!: HTMLElement;

  async init(): Promise<void> {
    this.sorterContainer = document.getElementById('sorter-container')!;
    this.rankingContainer = document.getElementById('ranking-container')!;
    this.statsEl = document.getElementById('stats-bar')!;
    this.progressContainer = document.getElementById('progress-container')!;
    this.modeBarEl = document.getElementById('mode-bar')!;

    document.getElementById('undo-btn')?.addEventListener('click', () => this.handleUndo());
    document.getElementById('reset-btn')?.addEventListener('click', () => this.handleReset());

    // Language selector
    const langSelect = document.getElementById('lang-select') as HTMLSelectElement | null;
    if (langSelect) {
      for (const lang of SUPPORTED_LANGUAGES) {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = lang.label;
        if (lang.code === currentLanguage()) opt.selected = true;
        langSelect.appendChild(opt);
      }
      langSelect.addEventListener('change', () => {
        setLanguage(langSelect.value);
        this.renderNextBatch();
      });
    }

    this.rankingUI = new RankingUI(this.rankingContainer);

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
        progressBar.style.width = `${Math.round((loaded / total) * 100)}%`;
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
      ratings[pkm.id] = {
        pokemonId: pkm.id,
        mu: computePrior(pkm, DEFAULT_WEIGHTS),
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
      onboardingComplete: false,
      onboardingIndex: 0,
      weightHistory: [],
      pairingMode: 'exploration',
      modeAutoSwitch: true,
    };

    saveState(this.state);
  }

  private startSortLoop(): void {
    this.renderNextBatch();
  }

  // ─── Batch selection ──────────────────────────────────────────────────────

  private getBatchIds(): { ids: number[]; label: string | null } {
    if (!this.state) return { ids: [], label: null };

    if (!this.state.onboardingComplete) {
      const idx = this.state.onboardingIndex;
      const batch = ONBOARDING_BATCHES[idx];

      if (idx >= MIXED_MODE_START_INDEX) {
        // Mixed mode: scripted IDs (4) + 2 free picks
        const scriptedIds = batch.pokemonIds.filter((id) => this.allPokemon[id]);
        const exclude = [...scriptedIds, ...this.recentBatchIds];
        const freeIds = selectNextBatch(
          'exploration',
          this.state.ratings,
          this.allPokemon,
          this.state.weights,
          this.outliers,
          2,
          exclude
        );
        return { ids: [...scriptedIds, ...freeIds], label: batch.label };
      }

      const validIds = batch.pokemonIds.filter((id) => this.allPokemon[id]);
      return { ids: validIds, label: batch.label };
    }

    // Free mode — use current pairingMode
    const ids = selectNextBatch(
      this.state.pairingMode,
      this.state.ratings,
      this.allPokemon,
      this.state.weights,
      this.outliers,
      CONFIG.BATCH_SIZE,
      this.recentBatchIds
    );
    return { ids, label: null };
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  private preloadSprites(ids: number[]): void {
    for (const id of ids) {
      const pkm = this.allPokemon[id];
      if (pkm) new Image().src = pkm.sprite;
    }
  }

  private renderNextBatch(): void {
    if (!this.state) return;

    const { ids: batchIds, label } = this.getBatchIds();

    this.recentBatchIds = [...batchIds, ...this.recentBatchIds].slice(
      0,
      CONFIG.BATCH_SIZE * 2
    );

    const batchPokemon = batchIds.map((id) => this.allPokemon[id]).filter(Boolean);

    // Preload sprites for current batch so they appear instantly
    this.preloadSprites(batchIds);

    if (this.sorterUI) this.sorterUI.destroy();

    this.sorterUI = new SortBatchUI(
      this.sorterContainer,
      (rankedIds) => this.handleSort(rankedIds),
      () => this.handleSkip()
    );
    this.sorterUI.render(batchPokemon);

    // Show onboarding label if applicable
    this.renderOnboardingBanner(label);

    // Update ranking
    const confInfo = computeConfidence(
      this.state.ratings,
      this.allPokemon,
      this.state.weights,
      this.state.weightHistory
    );
    this.rankingUI!.update(this.state.ratings, this.allPokemon, {
      settled: confInfo.topNSettled,
      confidence: confInfo.confidence,
    });

    this.updateStats(confInfo.label);
    this.renderModeBar();
  }

  private renderOnboardingBanner(label: string | null): void {
    const existing = this.sorterContainer.querySelector('.onboarding-banner');
    if (existing) existing.remove();

    if (!label || !this.state || this.state.onboardingComplete) return;

    const idx = this.state.onboardingIndex;
    const banner = document.createElement('div');
    banner.className = 'onboarding-banner';
    banner.innerHTML =
      `<span class="onboarding-label">${label}</span>` +
      `<span class="onboarding-progress">Einrichtung (${idx + 1}/${ONBOARDING_COUNT}) — ` +
      `danach startet deine persönliche Rangliste</span>`;

    this.sorterContainer.prepend(banner);
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  private async handleSort(rankedIds: number[]): Promise<void> {
    if (!this.state) return;

    const result: SortResult = { timestamp: Date.now(), rankedIds };

    // Update Elo ratings for directly seen Pokémon
    const eloRatings = updateRatingsFromSort(rankedIds, this.state.ratings);

    // Update feature weights and propagate to all Pokémon
    const { weights: newWeights, ratings: newRatings } = updateWeightsAndPropagate(
      result,
      this.allPokemon,
      eloRatings,
      this.state.weights
    );

    // Track weight history (last WEIGHT_HISTORY_MAX snapshots)
    const weightHistory = [
      ...this.state.weightHistory,
      this.state.weights,
    ].slice(-WEIGHT_HISTORY_MAX);

    // Detect outliers
    this.outliers = detectOutliers(newRatings, this.allPokemon, newWeights);

    const history = [result, ...this.state.history].slice(0, CONFIG.HISTORY_LENGTH);

    // Advance onboarding if needed
    let onboardingComplete = this.state.onboardingComplete;
    let onboardingIndex = this.state.onboardingIndex;

    if (!onboardingComplete) {
      onboardingIndex = onboardingIndex + 1;
      if (onboardingIndex >= ONBOARDING_COUNT) {
        onboardingComplete = true;
        this.showOnboardingComplete();
      }
    }

    this.state = {
      ...this.state,
      ratings: newRatings,
      weights: newWeights,
      weightHistory,
      history,
      totalInteractions: this.state.totalInteractions + 1,
      onboardingComplete,
      onboardingIndex,
    };

    saveState(this.state);
    recordSortResult(result, SESSION_ID).catch(() => {});
    this.updateModeIfNeeded();
    this.renderNextBatch();
  }

  private handleSkip(): void {
    if (!this.state) return;

    if (!this.state.onboardingComplete) {
      const onboardingIndex = this.state.onboardingIndex + 1;
      const onboardingComplete = onboardingIndex >= ONBOARDING_COUNT;
      if (onboardingComplete) this.showOnboardingComplete();
      this.state = { ...this.state, onboardingIndex, onboardingComplete };
      saveState(this.state);
    }

    this.renderNextBatch();
  }

  private handleUndo(): void {
    if (!this.state || this.state.history.length === 0) {
      alert('Kein Undo-Schritt verfügbar.');
      return;
    }

    const [_lastResult, ...remainingHistory] = this.state.history;

    // Re-compute ratings from priors + remaining history
    const ratings: Record<number, Rating> = {};
    for (const pkm of Object.values(this.allPokemon)) {
      ratings[pkm.id] = {
        pokemonId: pkm.id,
        mu: computePrior(pkm, this.state.weights),
        sigma: CONFIG.INITIAL_SIGMA,
        comparisons: 0,
      };
    }

    let currentRatings = ratings;
    for (const result of [...remainingHistory].reverse()) {
      currentRatings = updateRatingsFromSort(result.rankedIds, currentRatings);
    }

    // Roll back onboarding if we were still in it
    let onboardingComplete = this.state.onboardingComplete;
    let onboardingIndex = this.state.onboardingIndex;
    if (!onboardingComplete || onboardingIndex < ONBOARDING_COUNT) {
      onboardingIndex = Math.max(0, onboardingIndex - 1);
      onboardingComplete = false;
    }

    this.state = {
      ...this.state,
      ratings: currentRatings,
      history: remainingHistory,
      weightHistory: this.state.weightHistory.slice(0, -1),
      totalInteractions: Math.max(0, this.state.totalInteractions - 1),
      onboardingComplete,
      onboardingIndex,
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

  // ─── UI helpers ───────────────────────────────────────────────────────────

  private showOnboardingComplete(): void {
    const banner = document.createElement('div');
    banner.className = 'welcome-back-banner';
    banner.textContent = 'Einrichtung abgeschlossen! Deine persönliche Rangliste startet jetzt.';
    document.body.prepend(banner);
    setTimeout(() => banner.remove(), 5000);
  }

  private updateStats(confidenceLabel: string): void {
    if (!this.state) return;
    const elapsed = Math.round((Date.now() - this.state.startedAt) / 60000);
    this.statsEl.textContent =
      `${this.state.totalInteractions} Interaktionen · ${elapsed} Min · ${confidenceLabel}`;
  }

  // ─── Mode management ───────────────────────────────────────────────────────

  private setMode(mode: PairingMode): void {
    if (!this.state) return;
    // Manual selection disables auto-switch so the choice sticks
    this.state = { ...this.state, pairingMode: mode, modeAutoSwitch: false };
    saveState(this.state);
    this.recentBatchIds = [];
    this.renderNextBatch();
  }

  private updateModeIfNeeded(): void {
    if (!this.state || !this.state.modeAutoSwitch || !this.state.onboardingComplete) return;

    const recommended = recommendMode(this.state.ratings);
    if (recommended !== this.state.pairingMode) {
      const prev = this.state.pairingMode;
      this.state = { ...this.state, pairingMode: recommended };
      saveState(this.state);
      this.showModeNotification(prev, recommended);
    }
  }

  private showModeNotification(_from: PairingMode, to: PairingMode): void {
    const messages: Record<PairingMode, string> = {
      exploration: 'Wechsle zu Erkunden — mehr Pokémon kennenlernen.',
      refinement: 'Wechsle zu Verfeinern — deine Top 30 sind bereit zum Feinsortieren.',
      challenge: 'Wechsle zu Aufsteiger prüfen — aussichtsreiche Pokémon klären.',
      onboarding: '',
    };
    const msg = messages[to];
    if (!msg) return;

    const banner = document.createElement('div');
    banner.className = 'welcome-back-banner';
    banner.textContent = msg;
    document.body.prepend(banner);
    setTimeout(() => banner.remove(), 5000);
  }

  private renderModeBar(): void {
    if (!this.state || !this.state.onboardingComplete) {
      this.modeBarEl.style.display = 'none';
      return;
    }

    this.modeBarEl.style.display = 'flex';
    this.modeBarEl.innerHTML = '';

    const modeMeta: Record<PairingMode, { label: string; title: string }> = {
      exploration: { label: 'Erkunden',          title: 'Neue Pokémon entdecken, maximale Informationsgewinnung' },
      refinement:  { label: 'Top verfeinern',    title: 'Deine Top-Pokémon fein sortieren' },
      challenge:   { label: 'Aufsteiger prüfen', title: 'Vielversprechende Pokémon gegen etablierte Favoriten testen' },
      onboarding:  { label: 'Einrichtung',       title: '' },
    };

    // Current mode indicator
    const indicator = document.createElement('span');
    indicator.className = 'mode-indicator';
    indicator.textContent = `Modus: ${modeMeta[this.state.pairingMode].label}`;
    this.modeBarEl.appendChild(indicator);

    // Manual mode buttons
    const btnGroup = document.createElement('div');
    btnGroup.className = 'mode-btn-group';
    const modes: PairingMode[] = ['exploration', 'refinement', 'challenge'];
    for (const m of modes) {
      const btn = document.createElement('button');
      btn.className = 'mode-btn' + (m === this.state.pairingMode ? ' mode-btn--active' : '');
      btn.textContent = modeMeta[m].label;
      btn.title = modeMeta[m].title;
      btn.addEventListener('click', () => this.setMode(m));
      btnGroup.appendChild(btn);
    }
    this.modeBarEl.appendChild(btnGroup);

    // Auto-switch toggle
    const autoLabel = document.createElement('label');
    autoLabel.className = 'mode-auto-label';
    const autoCheck = document.createElement('input');
    autoCheck.type = 'checkbox';
    autoCheck.checked = this.state.modeAutoSwitch;
    autoCheck.addEventListener('change', () => {
      if (!this.state) return;
      this.state = { ...this.state, modeAutoSwitch: autoCheck.checked };
      saveState(this.state);
    });
    autoLabel.appendChild(autoCheck);
    autoLabel.append(' Auto');
    this.modeBarEl.appendChild(autoLabel);
  }
}
