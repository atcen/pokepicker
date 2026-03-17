# pokepicker

## Kontext & Ziel

Dieses Projekt ist ein Redesign des [favorite-picker](https://github.com/antialiasis/favorite-picker) mit fokus auf Pokémon (1000+ Items). Das Original hat ein fundamentales Skalierungsproblem: es nutzt Batch-Elimination (O(n²)) und produziert erst nach einer kompletten Runde eine brauchbare Rangliste.

**Ziel:** Ein *Anytime Algorithm* — nach jeder Interaktion gibt es eine gültige, immer präzisere Rangliste. Der User kann jederzeit aufhören und hat trotzdem ein sinnvolles Ergebnis.

**Core-Idee:** Sort-Batches (der User sortiert 5–6 Pokémon per Drag-and-Drop in eine Reihenfolge) kombiniert mit einem Feature-aware Elo-Rating (Prior aus Typ, Generation, Evo-Linie).

---

## Stack

- **Vanilla TypeScript** — kein Framework, läuft komplett im Browser
- **Vite** als Build-Tool
- **PokeAPI** (https://pokeapi.co) für Pokémon-Daten und Sprites
- Kein Backend, alles localStorage

---

## Architektur-Überblick

```
src/
  data/
    pokeapi.ts        # PokeAPI-Fetcher + lokaler Cache (localStorage)
    features.ts       # Feature-Extraktion: Typ, Gen, Evo-Linie, Form-Gruppe
  rating/
    elo.ts            # Elo-Implementierung mit Unsicherheit (μ, σ)
    prior.ts          # Feature-Gewichte → Prior-Rating berechnen
    weights.ts        # Online-Update der Feature-Gewichte nach jedem Batch
    pairing.ts        # Welcher Batch als nächstes? Max Information Gain
  ui/
    sorter.ts         # Drag-and-Drop Sort-Interface
    ranking.ts        # Live-Ranglisten-Anzeige
    app.ts            # Haupt-Controller
  types.ts            # Gemeinsame TypeScript-Types
  main.ts             # Entry Point
index.html
```

---

## Datenmodell

```typescript
// types.ts

interface PokemonFeatures {
  id: number;
  name: string;
  sprite: string;          // URL vom PokeAPI
  types: string[];         // ['fire', 'flying']
  generation: number;      // 1–9
  evoLineId: number;       // ID des Basis-Pokémon der Evo-Linie
  evoStage: number;        // 0 = Basis, 1 = erste Evo, 2 = zweite Evo
  bodyGroup: string;       // 'quadruped' | 'bipedal' | 'serpentine' | etc.
  isLegendary: boolean;
  isMythical: boolean;
  isPseudoLegendary: boolean;
}

interface Rating {
  pokemonId: number;
  mu: number;              // Elo-Rating, startet bei Prior
  sigma: number;           // Unsicherheit, startet bei 300
  comparisons: number;     // Wie oft wurde dieses Pokémon bewertet
}

interface FeatureWeights {
  types: Record<string, number>;     // 'fire' → 0.8
  generation: Record<number, number>; // 3 → 0.6
  bodyGroup: Record<string, number>;
  legendary: number;
  mythical: number;
  pseudoLegendary: number;
  evoStage: Record<number, number>;  // höhere Evos tendenziell bevorzugt?
}

interface AppState {
  ratings: Record<number, Rating>;
  weights: FeatureWeights;
  history: SortResult[];    // für Undo
  totalInteractions: number;
  startedAt: number;
}

interface SortResult {
  timestamp: number;
  rankedIds: number[];      // sortierte IDs aus einem Batch, Index 0 = Favorit
}
```

---

## Modul 1: PokeAPI (`data/pokeapi.ts`)

Lädt Pokémon-Daten und cached sie aggressiv in localStorage.

```typescript
// Zu implementieren:

// Lädt alle Pokémon 1–1025 (oder konfigurierbarer Range)
// Nutzt PokeAPI-Endpoints:
//   GET https://pokeapi.co/api/v2/pokemon/{id}  → sprite, types
//   GET https://pokeapi.co/api/v2/pokemon-species/{id} → generation, is_legendary, is_mythical, evolution_chain url
//   GET https://pokeapi.co/api/v2/evolution-chain/{id} → Evo-Linie rekonstruieren

// Cache-Strategie:
// - Einzelne Pokémon in localStorage als 'pkm_{id}'
// - Beim ersten Start: lade alle in Batches von 20 parallel (rate-limit-freundlich)
// - Zeige Ladefortschritt in der UI

async function fetchAllPokemon(
  onProgress: (loaded: number, total: number) => void
): Promise<PokemonFeatures[]>

async function fetchPokemon(id: number): Promise<PokemonFeatures>
```

**Wichtig:** Die PokeAPI hat kein Rate-Limit für normale Nutzung, aber parallele Batches von max. 20 gleichzeitigen Requests sind höflich.

---

## Modul 2: Feature-Extraktion (`data/features.ts`)

```typescript
// Extrahiert aus rohen PokeAPI-Daten die für das Rating relevanten Features
// isPseudoLegendary: manuell definierte Liste (Dragonite, Tyranitar, Salamence, 
//   Metagross, Garchomp, Hydreigon, Goodra, Kommo-o, Dragapult, Baxcalibur)

function extractFeatures(rawApiData: any): PokemonFeatures

// Body-Gruppen aus PokeAPI shape endpoint mappen:
// 'head' | 'squiggle' | 'fish' | 'arms' | 'blob' | 'upright' | 
// 'legs' | 'quadruped' | 'wings' | 'tentacles' | 'heads' | 'serpentine'
function mapBodyGroup(shape: string): string
```

---

## Modul 3: Prior-Berechnung (`rating/prior.ts`)

Berechnet ein initiales Rating für jedes Pokémon basierend auf den aktuellen Feature-Gewichten. Das ist der Kern des "Feature-aware" Ansatzes.

```typescript
// Startwerte für FeatureWeights (vor jeder Nutzerinteraktion):
const DEFAULT_WEIGHTS: FeatureWeights = {
  types: {
    dragon: 50, fire: 30, psychic: 20, dark: 20, ghost: 15,
    water: 0, grass: 0, normal: -20, bug: -30, poison: -10,
    // alle 18 Typen definieren
  },
  generation: { 1: 20, 2: 10, 3: 15, 4: 10, 5: 5, 6: 0, 7: 0, 8: -5, 9: -5 },
  bodyGroup: { serpentine: 30, quadruped: 20, bipedal: 10, blob: -10 },
  legendary: 80,
  mythical: 60,
  pseudoLegendary: 70,
  evoStage: { 0: -10, 1: 0, 2: 20 }
}
// WICHTIG: Diese Defaults sind absichtlich konservativ/generisch.
// Sie werden nach den ersten ~30 Interaktionen durch echte Nutzerdaten ersetzt.

const BASE_RATING = 1000;

function computePrior(pokemon: PokemonFeatures, weights: FeatureWeights): number
// Gibt ein Rating zwischen ~600 und ~1400 zurück
// Formel: BASE_RATING + sum(gewichtete Feature-Beiträge), geclampt
```

---

## Modul 4: Elo mit Unsicherheit (`rating/elo.ts`)

Basiert auf TrueSkill-Konzepten, vereinfacht auf eine einzelne Dimension.

```typescript
const INITIAL_SIGMA = 300;
const K_BASE = 32;  // Elo K-Faktor Basis

// Nach einem Sort-Batch: aktualisiere alle Ratings
// rankedIds[0] = Sieger, rankedIds[last] = Letzter
// Jede Position impliziert einen Paarvergleich mit allen darunter liegenden
function updateRatingsFromSort(
  rankedIds: number[],
  ratings: Record<number, Rating>
): Record<number, Rating>

// K-Faktor sinkt mit Anzahl Vergleiche (weniger Änderung bei etablierten Ratings)
function kFactor(comparisons: number): number
// k = K_BASE / (1 + comparisons * 0.1), minimum 8

// Sigma-Update: nach jedem Vergleich sinkt Unsicherheit
function updateSigma(sigma: number, comparisons: number): number
// sigma = max(50, INITIAL_SIGMA - comparisons * 15)

// Erwartetes Ergebnis im Paarvergleich (klassische Elo-Formel)
function expectedScore(ratingA: number, ratingB: number): number
```

---

## Modul 5: Feature-Gewichte updaten (`rating/weights.ts`)

Das ist der Online-Learning-Teil. Nach jedem Sort-Batch werden die Feature-Gewichte angepasst, damit künftige Priors besser passen.

```typescript
// Nach einem Sort-Batch: 
// Vergleiche tatsächliches Rating-Ergebnis mit Prior-Vorhersage
// Wenn Prior weit daneben lag → update den relevanten Feature-Gewicht

function updateWeights(
  sortResult: SortResult,
  pokemon: Record<number, PokemonFeatures>,
  ratings: Record<number, Rating>,
  weights: FeatureWeights
): FeatureWeights

// Lernrate: klein halten um Überanpassung zu vermeiden
const LEARNING_RATE = 0.05;

// Ausreißer-Erkennung:
// Wenn tatsächliches Rating > Prior + 200 → "positiver Ausreißer"
// Wenn tatsächliches Rating < Prior - 200 → "negativer Ausreißer"
// Ausreißer bekommen mehr Vergleiche zugewiesen (höheres sigma behalten)
function detectOutliers(
  ratings: Record<number, Rating>,
  pokemon: Record<number, PokemonFeatures>,
  weights: FeatureWeights
): number[]  // IDs der Ausreißer
```

---

## Modul 6: Pairing-Algorithmus (`rating/pairing.ts`)

Entscheidet welche 5–6 Pokémon im nächsten Batch erscheinen.

```typescript
// Ziele (in Priorität):
// 1. Mindestens 1 Pokémon mit hohem sigma (wenig gesehen) pro Batch
// 2. Mindestens 1 Pokémon mit niedrigem sigma + hohem mu (bekannter Favorit)
//    → einfachere Entscheidung für den User
// 3. Ausreißer bekommen bevorzugt Slots
// 4. Pokémon die sich im Rating sehr nahe sind → informativer Vergleich
// 5. Nie dasselbe Pair zweimal in aufeinanderfolgenden Batches

function selectNextBatch(
  ratings: Record<number, Rating>,
  pokemon: Record<number, PokemonFeatures>,
  outliers: number[],
  batchSize: number,
  recentBatchIds: number[]   // letzte 2 Batches, zum Vermeiden von Wiederholungen
): number[]

// Frühstopp-Signal: ist die Rangliste "gut genug"?
// Kriterium: Top-50 alle sigma < 100 UND klar separiert (kein sigma-Overlap)
function isRankingSettled(
  ratings: Record<number, Rating>,
  topN: number
): { settled: boolean; confidence: number }
```

---

## Modul 7: Sort-Interface (`ui/sorter.ts`)

Das Herzstück der UI. Zeigt einen Batch von 5–6 Pokémon-Karten an, die per Drag-and-Drop sortiert werden können.

```typescript
// Anforderungen:
// - Pokémon-Karte: Sprite (offiziellem PokeAPI-Sprite), Name, Typen als farbige Pills
// - Drag-and-Drop: nativ HTML5 DnD oder Pointer Events (kein externes Library)
// - Touch-Support: funktioniert auf Mobile
// - Visuelle Reihenfolge: Platz 1 links/oben, Platz n rechts/unten
// - "Bestätigen"-Button: submittet die aktuelle Reihenfolge
// - "Überspringen"-Button: dieser Batch wird nicht gewertet (alle σ bleiben hoch)
// - Keyboard-Support: Tab + Pfeiltasten zum Umsortieren

// Karten-Layout:
// ┌─────────────┐
// │   [Sprite]  │
// │   Glumanda  │
// │  🔥 Feuer   │
// │  #4 Gen 1   │
// └─────────────┘

class SortBatchUI {
  constructor(container: HTMLElement, onSubmit: (rankedIds: number[]) => void)
  render(pokemon: PokemonFeatures[]): void
  destroy(): void
}
```

**UX-Details:**
- Karten haben einen subtilen Schatten und Hover-Effekt
- Beim Draggen: Original-Position zeigt einen leeren Platzhalter
- Nach Submit: kurze Animations-Transition bevor der nächste Batch lädt
- Aktuelle Position (#1, #2, ...) als Badge auf der Karte sichtbar

---

## Modul 8: Ranking-Anzeige (`ui/ranking.ts`)

Zeigt die aktuelle Rangliste live neben dem Sort-Interface.

```typescript
// Anforderungen:
// - Scrollbare Liste, immer aktuell
// - Zeigt: Rang, Sprite (klein), Name, Rating (μ), Konfidenz-Balken (1 - σ/300)
// - Konfidenz-Balken: grau = unsicher, grün = gut etabliert
// - Frühstopp-Indikator: wenn Top-50 settled → grüner Banner "Top 50 stabil"
// - "Export"-Button: lädt Rangliste als JSON oder CSV

// Konfidenz visuell:
// σ=300 → leerer Balken (grau)
// σ=150 → halbvoller Balken
// σ=50  → voller Balken (grün)

class RankingUI {
  constructor(container: HTMLElement)
  update(ratings: Record<number, Rating>, pokemon: Record<number, PokemonFeatures>): void
}
```

---

## Modul 9: App-Controller (`ui/app.ts`)

Verbindet alles.

```typescript
// State-Management:
// - AppState wird nach jeder Interaktion in localStorage gespeichert
// - Beim Start: Lade State falls vorhanden (mit "Willkommen zurück"-Banner)
// - Undo: letzter SortResult rückgängig machen (Ratings zurückrechnen)

// Ablauf:
// 1. Beim ersten Start: alle Pokémon von PokeAPI laden (mit Fortschrittsbalken)
// 2. Priors berechnen mit DEFAULT_WEIGHTS
// 3. Ersten Batch auswählen (pairing.selectNextBatch)
// 4. SortBatchUI rendern
// 5. Nach Submit:
//    a. Ratings updaten (elo.updateRatingsFromSort)
//    b. Feature-Gewichte updaten (weights.updateWeights)
//    c. Ausreißer detektieren
//    d. Ranking-Anzeige updaten
//    e. State speichern
//    f. Nächsten Batch auswählen → zurück zu 4
// 6. Frühstopp prüfen → optionalen Banner zeigen

// Statistik-Anzeige (oben in der UI):
// "X Interaktionen · Y Min · Top 50: Z% Konfidenz"
```

---

## Layout (`index.html`)

```
┌─────────────────────────────────────────────────┐
│  Pokemon Picker  [X Interaktionen] [Y Min] [↩️] │
├──────────────────────────┬──────────────────────┤
│                          │                      │
│   Sortiere diese 6:      │   Aktuelle Rangliste │
│                          │                      │
│  [Karte] [Karte] [Karte] │  #1  Glurak    ████  │
│  [Karte] [Karte] [Karte] │  #2  Rayquaza  ███░  │
│                          │  #3  Mewtwo    ███░  │
│  [Bestätigen] [Skip]     │  #4  ...             │
│                          │  ...                 │
│                          │  [Export CSV/JSON]   │
└──────────────────────────┴──────────────────────┘
```

Responsiv: auf Mobile → Sort-Interface oben, Rangliste unten (zusammenklappbar).

---

## Konfiguration

Alle wichtigen Parameter in einer zentralen `config.ts`:

```typescript
export const CONFIG = {
  POKEMON_COUNT: 1025,      // 1–1025 laden
  BATCH_SIZE: 6,            // Items pro Sort-Batch
  INITIAL_SIGMA: 300,
  MIN_SIGMA: 50,
  BASE_RATING: 1000,
  K_BASE: 32,
  LEARNING_RATE: 0.05,
  OUTLIER_THRESHOLD: 200,   // Delta Prior vs. tatsächlich
  SETTLED_SIGMA: 100,       // Unter diesem Wert gilt ein Rating als etabliert
  SETTLED_TOP_N: 50,        // Frühstopp wenn Top-N alle settled
  API_BATCH_SIZE: 20,       // Parallele PokeAPI-Requests beim Laden
  HISTORY_LENGTH: 10,       // Wie viele Undo-Schritte
} as const;
```

---

## Was bewusst weggelassen wird

- Keine Authentifizierung
- Keine Tier-List-Darstellung (bewusst: strikte Reihenfolge erzwingt Abwägung)

---

## Stats

Es sollen Statistiken über die Wahl über alle User hinweg erfasst werden. Sollten wir auch in der Lage sein langfristig den Algorithmus zu optimieren.
Nutze hierfür SQLite evtl auch wenn es sinnmacht mit Vector.

---

## Qualitätskriterien / Definition of Done

- [ ] 1000 Pokémon laden und cachen ohne spürbaren Lag
- [ ] Nach 10 Batches ist die Top-10-Rangliste subjektiv sinnvoll
- [ ] Funktioniert auf Mobile (Touch Drag-and-Drop)
- [ ] Undo funktioniert korrekt (Rating-State wird zurückgesetzt)
- [ ] LocalStorage-State überlebt Page-Reload
- [ ] Export als CSV funktioniert
- [ ] TypeScript strict mode, keine `any`
- [ ] Kein externes UI-Framework (nur Vite + TypeScript)
