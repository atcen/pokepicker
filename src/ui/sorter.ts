import type { PokemonFeatures } from '../types';
import { TYPE_COLORS } from './typeColors';

type DragSource =
  | { zone: 'pool'; pokemonIdx: number }
  | { zone: 'slot'; slotIndex: number };

export class SortBatchUI {
  private container: HTMLElement;
  private onSubmit: (rankedIds: number[]) => void;
  private onSkip: () => void;
  private pokemon: PokemonFeatures[] = [];

  // Pool: indices of pokemon not yet placed
  private pool: number[] = [];
  // Slots: pokemon indices in ranked positions, null = empty
  private slots: (number | null)[] = [];

  // Drag state
  private dragSource: DragSource | null = null;
  private touchClone: HTMLElement | null = null;

  // Click-to-place selection
  private selected: DragSource | null = null;

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
    this.pool = pokemon.map((_, i) => i);
    this.slots = new Array(pokemon.length).fill(null);
    this.selected = null;
    this.renderUI();
  }

  private renderUI(): void {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'pool-ui';

    // --- Pool section ---
    const poolSection = document.createElement('div');
    poolSection.className = 'pool-section';

    const poolTitle = document.createElement('div');
    poolTitle.className = 'pool-title';
    poolTitle.textContent = 'Pool';
    poolSection.appendChild(poolTitle);

    const poolArea = document.createElement('div');
    poolArea.className = 'pool-area';
    poolArea.dataset.zone = 'pool';

    if (this.pool.length === 0) {
      poolArea.classList.add('pool-empty');
      poolArea.textContent = 'Alle Pokémon platziert';
    } else {
      for (const pokemonIdx of this.pool) {
        poolArea.appendChild(this.createPoolCard(pokemonIdx));
      }
    }

    // Pool is also a drop target (to return cards from slots)
    poolArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      poolArea.classList.add('drag-over-pool');
    });
    poolArea.addEventListener('dragleave', () => poolArea.classList.remove('drag-over-pool'));
    poolArea.addEventListener('drop', (e) => {
      e.preventDefault();
      poolArea.classList.remove('drag-over-pool');
      if (this.dragSource?.zone === 'slot') {
        this.moveToPool(this.dragSource.slotIndex);
      }
    });

    poolSection.appendChild(poolArea);
    wrapper.appendChild(poolSection);

    // --- Slots section ---
    const slotsSection = document.createElement('div');
    slotsSection.className = 'slots-section';

    const slotsTitle = document.createElement('div');
    slotsTitle.className = 'slots-title';
    slotsTitle.textContent = 'Meine Rangliste';
    slotsSection.appendChild(slotsTitle);

    const slotsArea = document.createElement('div');
    slotsArea.className = 'slots-area';

    for (let i = 0; i < this.slots.length; i++) {
      slotsArea.appendChild(this.createSlot(i));
    }
    slotsSection.appendChild(slotsArea);
    wrapper.appendChild(slotsSection);

    // --- Actions ---
    const actions = document.createElement('div');
    actions.className = 'sorter-actions';

    const filled = this.slots.filter((s) => s !== null).length;
    const total = this.slots.length;
    const allFilled = filled === total;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = allFilled ? 'Bestätigen' : `Bestätigen (${filled}/${total})`;
    confirmBtn.disabled = !allFilled;
    if (!allFilled) confirmBtn.classList.add('btn-disabled');
    confirmBtn.addEventListener('click', () => this.handleSubmit());

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-secondary';
    skipBtn.textContent = 'Überspringen';
    skipBtn.addEventListener('click', () => this.onSkip());

    actions.appendChild(confirmBtn);
    actions.appendChild(skipBtn);
    wrapper.appendChild(actions);

    this.container.appendChild(wrapper);
  }

  // ─── Card creation ────────────────────────────────────────────────────────

  private createPoolCard(pokemonIdx: number): HTMLElement {
    const pkm = this.pokemon[pokemonIdx];
    const card = this.buildCard(pkm);
    card.classList.add('pool-card');

    const isSelected =
      this.selected?.zone === 'pool' && this.selected.pokemonIdx === pokemonIdx;
    if (isSelected) card.classList.add('card-selected');

    // Drag
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      this.dragSource = { zone: 'pool', pokemonIdx };
      card.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      this.dragSource = null;
      card.classList.remove('dragging');
    });

    // Touch
    card.addEventListener('touchstart', (e) => this.onTouchStart(e, { zone: 'pool', pokemonIdx }), { passive: false });
    card.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    card.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

    // Click-to-select
    card.addEventListener('click', () => this.handlePoolCardClick(pokemonIdx));

    return card;
  }

  private createSlot(slotIndex: number): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'sort-slot';
    slot.dataset.slotIndex = String(slotIndex);

    const label = document.createElement('span');
    label.className = 'slot-label';
    label.textContent = `#${slotIndex + 1}`;
    slot.appendChild(label);

    const content = this.slots[slotIndex];

    if (content !== null) {
      const pkm = this.pokemon[content];
      const card = this.buildCard(pkm);
      card.classList.add('slotted-card');

      const isSelected =
        this.selected?.zone === 'slot' && this.selected.slotIndex === slotIndex;
      if (isSelected) card.classList.add('card-selected');

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'slot-remove-btn';
      removeBtn.textContent = '×';
      removeBtn.title = 'Zurück in Pool';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveToPool(slotIndex);
      });
      card.appendChild(removeBtn);

      // Drag from slot
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', (e) => {
        this.dragSource = { zone: 'slot', slotIndex };
        card.classList.add('dragging');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        this.dragSource = null;
        card.classList.remove('dragging');
      });

      // Touch from slot
      card.addEventListener('touchstart', (e) => this.onTouchStart(e, { zone: 'slot', slotIndex }), { passive: false });
      card.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
      card.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

      // Click on occupied slot
      card.addEventListener('click', () => this.handleSlotCardClick(slotIndex));

      slot.appendChild(card);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'slot-placeholder';
      placeholder.textContent = 'hier ablegen';
      slot.appendChild(placeholder);
    }

    // Slot as drop target
    slot.addEventListener('dragover', (e) => {
      if (!this.dragSource) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      slot.classList.add('slot-drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('slot-drag-over'));
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('slot-drag-over');
      if (!this.dragSource) return;
      this.dropOnSlot(slotIndex);
    });

    // Click on empty slot (for click-to-place)
    slot.addEventListener('click', (e) => {
      if (e.target === slot || (e.target as HTMLElement).classList.contains('slot-placeholder')) {
        this.handleEmptySlotClick(slotIndex);
      }
    });

    return slot;
  }

  private buildCard(pkm: PokemonFeatures): HTMLElement {
    const card = document.createElement('div');
    card.className = 'pokemon-card';
    card.setAttribute('tabindex', '0');

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

    return card;
  }

  // ─── Drag logic ───────────────────────────────────────────────────────────

  private dropOnSlot(targetSlotIndex: number): void {
    if (!this.dragSource) return;

    if (this.dragSource.zone === 'pool') {
      const pokemonIdx = this.dragSource.pokemonIdx;
      const displaced = this.slots[targetSlotIndex];
      this.slots[targetSlotIndex] = pokemonIdx;
      this.pool = this.pool.filter((i) => i !== pokemonIdx);
      if (displaced !== null) this.pool.push(displaced);
    } else {
      const sourceSlot = this.dragSource.slotIndex;
      if (sourceSlot === targetSlotIndex) return;
      // Swap
      const temp = this.slots[targetSlotIndex];
      this.slots[targetSlotIndex] = this.slots[sourceSlot];
      this.slots[sourceSlot] = temp;
    }

    this.dragSource = null;
    this.renderUI();
  }

  private moveToPool(slotIndex: number): void {
    const pokemonIdx = this.slots[slotIndex];
    if (pokemonIdx === null) return;
    this.pool.push(pokemonIdx);
    this.slots[slotIndex] = null;
    this.dragSource = null;
    this.renderUI();
  }

  // ─── Click-to-place logic ─────────────────────────────────────────────────

  private handlePoolCardClick(pokemonIdx: number): void {
    if (this.selected?.zone === 'pool' && this.selected.pokemonIdx === pokemonIdx) {
      // Deselect
      this.selected = null;
    } else if (this.selected?.zone === 'slot') {
      // Move slot card back to pool, place new card from pool into that slot
      const slotIndex = this.selected.slotIndex;
      const displaced = this.slots[slotIndex];
      this.slots[slotIndex] = pokemonIdx;
      this.pool = this.pool.filter((i) => i !== pokemonIdx);
      if (displaced !== null) this.pool.push(displaced);
      this.selected = null;
    } else {
      // Select this pool card
      this.selected = { zone: 'pool', pokemonIdx };
    }
    this.renderUI();
  }

  private handleSlotCardClick(slotIndex: number): void {
    if (this.selected?.zone === 'slot' && this.selected.slotIndex === slotIndex) {
      // Deselect
      this.selected = null;
    } else if (this.selected?.zone === 'pool') {
      // Place selected pool card into this slot
      const pokemonIdx = this.selected.pokemonIdx;
      const displaced = this.slots[slotIndex];
      this.slots[slotIndex] = pokemonIdx;
      this.pool = this.pool.filter((i) => i !== pokemonIdx);
      if (displaced !== null) this.pool.push(displaced);
      this.selected = null;
    } else if (this.selected?.zone === 'slot') {
      // Swap two slots
      const src = this.selected.slotIndex;
      const temp = this.slots[slotIndex];
      this.slots[slotIndex] = this.slots[src];
      this.slots[src] = temp;
      this.selected = null;
    } else {
      // Select this slot card
      this.selected = { zone: 'slot', slotIndex };
    }
    this.renderUI();
  }

  private handleEmptySlotClick(slotIndex: number): void {
    if (this.selected?.zone === 'pool') {
      const pokemonIdx = this.selected.pokemonIdx;
      this.slots[slotIndex] = pokemonIdx;
      this.pool = this.pool.filter((i) => i !== pokemonIdx);
      this.selected = null;
      this.renderUI();
    } else if (this.selected?.zone === 'slot') {
      // Move slot card to this empty slot
      const src = this.selected.slotIndex;
      this.slots[slotIndex] = this.slots[src];
      this.slots[src] = null;
      this.selected = null;
      this.renderUI();
    }
  }

  // ─── Touch drag ──────────────────────────────────────────────────────────

  private onTouchStart(e: TouchEvent, source: DragSource): void {
    e.preventDefault();
    this.dragSource = source;
    this.selected = null;

    const card = e.currentTarget as HTMLElement;
    const clone = card.cloneNode(true) as HTMLElement;
    clone.style.cssText =
      'position:fixed;pointer-events:none;opacity:0.85;z-index:9999;' +
      `width:${card.offsetWidth}px;`;
    document.body.appendChild(clone);
    this.touchClone = clone;

    const t = e.touches[0];
    this.moveTouchClone(t.clientX, t.clientY);
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.touchClone) return;
    const t = e.touches[0];
    this.moveTouchClone(t.clientX, t.clientY);

    // Highlight drop targets
    this.clearDragOverHighlights();
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const slot = el?.closest('.sort-slot') as HTMLElement | null;
    const pool = el?.closest('.pool-area') as HTMLElement | null;
    if (slot) slot.classList.add('slot-drag-over');
    if (pool) pool.classList.add('drag-over-pool');
  }

  private onTouchEnd(e: TouchEvent): void {
    if (this.touchClone) {
      document.body.removeChild(this.touchClone);
      this.touchClone = null;
    }
    this.clearDragOverHighlights();

    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);

    const slotEl = el?.closest('.sort-slot') as HTMLElement | null;
    const poolEl = el?.closest('.pool-area') as HTMLElement | null;

    if (slotEl && this.dragSource) {
      const targetSlotIndex = parseInt(slotEl.dataset.slotIndex ?? '-1', 10);
      if (targetSlotIndex >= 0) {
        this.dropOnSlot(targetSlotIndex);
        return;
      }
    }

    if (poolEl && this.dragSource?.zone === 'slot') {
      this.moveToPool(this.dragSource.slotIndex);
      return;
    }

    this.dragSource = null;
  }

  private moveTouchClone(x: number, y: number): void {
    if (!this.touchClone) return;
    this.touchClone.style.left = x - this.touchClone.offsetWidth / 2 + 'px';
    this.touchClone.style.top = y - this.touchClone.offsetHeight / 2 + 'px';
  }

  private clearDragOverHighlights(): void {
    this.container
      .querySelectorAll('.slot-drag-over, .drag-over-pool')
      .forEach((el) => el.classList.remove('slot-drag-over', 'drag-over-pool'));
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  private handleSubmit(): void {
    const allFilled = this.slots.every((s) => s !== null);
    if (!allFilled) return;

    const rankedIds = (this.slots as number[]).map((idx) => this.pokemon[idx].id);
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
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('-');
}
