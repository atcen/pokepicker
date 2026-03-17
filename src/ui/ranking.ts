import type { PokemonFeatures, Rating } from '../types';
import { CONFIG } from '../config';
import { getName } from '../data/i18n';

function formatName(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

export class RankingUI {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  update(
    ratings: Record<number, Rating>,
    pokemon: Record<number, PokemonFeatures>,
    settledInfo?: { settled: boolean; confidence: number }
  ): void {
    const sorted = Object.values(ratings)
      .filter((r) => pokemon[r.pokemonId])
      .sort((a, b) => b.mu - a.mu);

    this.container.innerHTML = '';

    if (settledInfo?.settled) {
      const banner = document.createElement('div');
      banner.className = 'settled-banner';
      banner.textContent = `Top ${CONFIG.SETTLED_TOP_N} stabil! Konfidenz: ${Math.round(settledInfo.confidence * 100)}%`;
      this.container.appendChild(banner);
    }

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-small';
    exportBtn.textContent = 'Export CSV/JSON';
    exportBtn.addEventListener('click', () => this.handleExport(sorted, pokemon));
    this.container.appendChild(exportBtn);

    const list = document.createElement('ol');
    list.className = 'ranking-list';

    sorted.forEach((rating, idx) => {
      const pkm = pokemon[rating.pokemonId];
      if (!pkm) return;

      const item = document.createElement('li');
      item.className = 'ranking-item';

      const rank = document.createElement('span');
      rank.className = 'ranking-rank';
      rank.textContent = `#${idx + 1}`;

      const img = document.createElement('img');
      img.src = pkm.sprite;
      img.alt = pkm.name;
      img.className = 'ranking-sprite';
      img.loading = 'lazy';

      const nameEl = document.createElement('span');
      nameEl.className = 'ranking-name';
      nameEl.textContent = getName(pkm.id, formatName(pkm.name));

      const ratingEl = document.createElement('span');
      ratingEl.className = 'ranking-rating';
      ratingEl.textContent = Math.round(rating.mu).toString();

      const confidence = 1 - rating.sigma / CONFIG.INITIAL_SIGMA;
      const bar = document.createElement('div');
      bar.className = 'confidence-bar';
      const fill = document.createElement('div');
      fill.className = 'confidence-fill';
      fill.style.width = `${Math.max(0, Math.min(100, confidence * 100))}%`;

      // Color based on confidence
      if (confidence > 0.7) fill.style.backgroundColor = '#4caf50';
      else if (confidence > 0.4) fill.style.backgroundColor = '#ff9800';
      else fill.style.backgroundColor = '#9e9e9e';

      bar.appendChild(fill);

      item.appendChild(rank);
      item.appendChild(img);
      item.appendChild(nameEl);
      item.appendChild(ratingEl);
      item.appendChild(bar);
      list.appendChild(item);
    });

    this.container.appendChild(list);
  }

  private handleExport(
    sorted: Rating[],
    pokemon: Record<number, PokemonFeatures>
  ): void {
    const data = sorted.map((r, idx) => {
      const pkm = pokemon[r.pokemonId];
      return {
        rank: idx + 1,
        id: r.pokemonId,
        name: pkm?.name ?? '',
        types: pkm?.types.join('/') ?? '',
        generation: pkm?.generation ?? '',
        rating: Math.round(r.mu),
        uncertainty: Math.round(r.sigma),
        comparisons: r.comparisons,
      };
    });

    // Show export options
    const choice = confirm('CSV exportieren? (Abbrechen für JSON)');

    if (choice) {
      // CSV
      const header = 'rank,id,name,types,generation,rating,uncertainty,comparisons\n';
      const rows = data.map(
        (d) =>
          `${d.rank},${d.id},"${d.name}","${d.types}",${d.generation},${d.rating},${d.uncertainty},${d.comparisons}`
      );
      downloadFile('pokepicker-ranking.csv', 'text/csv', header + rows.join('\n'));
    } else {
      // JSON
      downloadFile(
        'pokepicker-ranking.json',
        'application/json',
        JSON.stringify(data, null, 2)
      );
    }
  }
}

function downloadFile(filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
