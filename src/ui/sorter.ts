import type { PokemonFeatures } from '../types';
import { TYPE_COLORS } from './typeColors';

export class SortBatchUI {
  private container: HTMLElement;
  private onSubmit: (rankedIds: number[]) => void;
  private onSkip: () => void;
  private pokemon: PokemonFeatures[] = [];
  private order: number[] = []; // indices into pokemon array
  private dragSrcIndex: number | null = null;

  // Touch drag state
  private touchDragIndex: number | null = null;
  private touchClone: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    onSubmit: (rankedIds: number[]) => void,
    onSkip: () => void
  ) {
    this.container = container;
    this.onSubmit = onSubmit;
    this.onSkip = onSkip;
  }

  render(pokemon: PokemonFeatures[]): void {
    this.pokemon = pokemon;
    this.order = pokemon.map((_, i) => i);
    this.renderUI();
  }

  private renderUI(): void {
    this.container.innerHTML = '';

    const title = document.createElement('h2');
    title.className = 'sorter-title';
    title.textContent = 'Sortiere diese Pokémon (Favorit zuerst)';
    this.container.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'sort-grid';
    grid.setAttribute('aria-label', 'Sortierbare Pokémon-Karten');

    this.order.forEach((pokemonIdx, position) => {
      const card = this.createCard(pokemonIdx, position);
      grid.appendChild(card);
    });

    this.container.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'sorter-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Bestätigen';
    confirmBtn.addEventListener('click', () => this.handleSubmit());

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-secondary';
    skipBtn.textContent = 'Überspringen';
    skipBtn.addEventListener('click', () => this.onSkip());

    actions.appendChild(confirmBtn);
    actions.appendChild(skipBtn);
    this.container.appendChild(actions);
  }

  private createCard(pokemonIdx: number, position: number): HTMLElement {
    const pkm = this.pokemon[pokemonIdx];
    const card = document.createElement('div');
    card.className = 'pokemon-card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${pkm.name}, Position ${position + 1}`);
    card.dataset.index = String(position);

    const badge = document.createElement('span');
    badge.className = 'position-badge';
    badge.textContent = `#${position + 1}`;
    card.appendChild(badge);

    const img = document.createElement('img');
    img.src = pkm.sprite;
    img.alt = pkm.name;
    img.className = 'pokemon-sprite';
    img.loading = 'lazy';
    card.appendChild(img);

    const name = document.createElement('div');
    name.className = 'pokemon-name';
    name.textContent = formatName(pkm.name);
    card.appendChild(name);

    const typesEl = document.createElement('div');
    typesEl.className = 'pokemon-types';
    for (const type of pkm.types) {
      const pill = document.createElement('span');
      pill.className = 'type-pill';
      pill.textContent = type;
      pill.style.backgroundColor = TYPE_COLORS[type] ?? '#888';
      typesEl.appendChild(pill);
    }
    card.appendChild(typesEl);

    const meta = document.createElement('div');
    meta.className = 'pokemon-meta';
    meta.textContent = `#${pkm.id} · Gen ${pkm.generation}`;
    card.appendChild(meta);

    // Mouse drag events
    card.addEventListener('dragstart', (e) => this.onDragStart(e, position));
    card.addEventListener('dragover', (e) => this.onDragOver(e, position));
    card.addEventListener('drop', (e) => this.onDrop(e, position));
    card.addEventListener('dragend', () => this.onDragEnd());

    // Touch events
    card.addEventListener('touchstart', (e) => this.onTouchStart(e, position), { passive: false });
    card.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    card.addEventListener('touchend', (e) => this.onTouchEnd(e, position));

    // Keyboard
    card.addEventListener('keydown', (e) => this.onKeyDown(e, position));

    return card;
  }

  private onDragStart(e: DragEvent, index: number): void {
    this.dragSrcIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
    const card = e.currentTarget as HTMLElement;
    card.classList.add('dragging');
  }

  private onDragOver(e: DragEvent, _index: number): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const card = e.currentTarget as HTMLElement;
    card.classList.add('drag-over');
  }

  private onDrop(e: DragEvent, targetIndex: number): void {
    e.preventDefault();
    const card = e.currentTarget as HTMLElement;
    card.classList.remove('drag-over');

    if (this.dragSrcIndex !== null && this.dragSrcIndex !== targetIndex) {
      this.swapPositions(this.dragSrcIndex, targetIndex);
    }
  }

  private onDragEnd(): void {
    this.dragSrcIndex = null;
    const grid = this.container.querySelector('.sort-grid');
    if (grid) {
      grid.querySelectorAll('.pokemon-card').forEach((c) => {
        c.classList.remove('dragging', 'drag-over');
      });
    }
  }

  private onTouchStart(e: TouchEvent, index: number): void {
    e.preventDefault();
    this.touchDragIndex = index;

    const card = e.currentTarget as HTMLElement;
    const clone = card.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '0.8';
    clone.style.zIndex = '9999';
    clone.style.width = card.offsetWidth + 'px';
    clone.classList.add('dragging');
    document.body.appendChild(clone);
    this.touchClone = clone;

    const touch = e.touches[0];
    this.moveTouchClone(touch.clientX, touch.clientY);
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.touchClone) return;
    const touch = e.touches[0];
    this.moveTouchClone(touch.clientX, touch.clientY);

    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const grid = this.container.querySelector('.sort-grid');
    if (grid) {
      grid.querySelectorAll('.pokemon-card').forEach((c) => c.classList.remove('drag-over'));
    }
    const targetCard = target?.closest('.pokemon-card') as HTMLElement | null;
    if (targetCard) targetCard.classList.add('drag-over');
  }

  private onTouchEnd(e: TouchEvent, _fromIndex: number): void {
    if (this.touchClone) {
      document.body.removeChild(this.touchClone);
      this.touchClone = null;
    }

    const touch = e.changedTouches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetCard = target?.closest('.pokemon-card') as HTMLElement | null;

    if (targetCard && this.touchDragIndex !== null) {
      const targetIndex = parseInt(targetCard.dataset.index ?? '-1', 10);
      if (targetIndex >= 0 && targetIndex !== this.touchDragIndex) {
        this.swapPositions(this.touchDragIndex, targetIndex);
      }
    }

    const grid = this.container.querySelector('.sort-grid');
    if (grid) {
      grid.querySelectorAll('.pokemon-card').forEach((c) => c.classList.remove('drag-over'));
    }
    this.touchDragIndex = null;
  }

  private moveTouchClone(x: number, y: number): void {
    if (!this.touchClone) return;
    this.touchClone.style.left = x - this.touchClone.offsetWidth / 2 + 'px';
    this.touchClone.style.top = y - this.touchClone.offsetHeight / 2 + 'px';
  }

  private onKeyDown(e: KeyboardEvent, index: number): void {
    const grid = this.container.querySelector('.sort-grid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.pokemon-card')) as HTMLElement[];

    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      this.swapPositions(index, index - 1);
      setTimeout(() => {
        const updated = grid.querySelectorAll('.pokemon-card');
        (updated[index - 1] as HTMLElement).focus();
      }, 0);
    } else if (e.key === 'ArrowRight' && index < cards.length - 1) {
      e.preventDefault();
      this.swapPositions(index, index + 1);
      setTimeout(() => {
        const updated = grid.querySelectorAll('.pokemon-card');
        (updated[index + 1] as HTMLElement).focus();
      }, 0);
    }
  }

  private swapPositions(from: number, to: number): void {
    const newOrder = [...this.order];
    const temp = newOrder[from];
    newOrder[from] = newOrder[to];
    newOrder[to] = temp;
    this.order = newOrder;
    this.renderUI();
  }

  private handleSubmit(): void {
    const rankedIds = this.order.map((idx) => this.pokemon[idx].id);
    this.container.classList.add('submitting');
    setTimeout(() => {
      this.container.classList.remove('submitting');
      this.onSubmit(rankedIds);
    }, 300);
  }

  destroy(): void {
    this.container.innerHTML = '';
    if (this.touchClone) {
      document.body.removeChild(this.touchClone);
      this.touchClone = null;
    }
  }
}

function formatName(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}
