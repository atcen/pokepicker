import type { PokemonFeatures } from '../types';
import { TYPE_COLORS } from './typeColors';
import { getName, getTypeName } from '../data/i18n';

type DragSource =
  | { zone: 'pool'; pokemonIdx: number }
  | { zone: 'slot'; slotIndex: number };

export class SortBatchUI {
  private container: HTMLElement;
  private onSubmit: (rankedIds: number[]) => void;
  private onSkip: () => void;
  private pokemon: PokemonFeatures[] = [];

  private pool: number[] = [];
  private slots: (number | null)[] = [];

  private dragSource: DragSource | null = null;
  private touchClone: HTMLElement | null = null;
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

    wrapper.appendChild(this.renderPool());
    wrapper.appendChild(this.renderSlots());
    wrapper.appendChild(this.renderActions());

    this.container.appendChild(wrapper);
  }

  // ─── Pool ─────────────────────────────────────────────────────────────────

  private renderPool(): HTMLElement {
    const section = document.createElement('div');

    const label = document.createElement('div');
    label.className = 'pool-label';
    label.textContent = 'Pool';
    section.appendChild(label);

    const area = document.createElement('div');
    area.className = this.pool.length === 0 ? 'pool-area pool-done' : 'pool-area';
    area.dataset.zone = 'pool';

    if (this.pool.length === 0) {
      area.textContent = '✓ Alle Pokémon platziert';
    } else {
      for (const idx of this.pool) {
        area.appendChild(this.createPoolCard(idx));
      }
    }

    area.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      area.classList.add('pool-drag-over');
    });
    area.addEventListener('dragleave', () => area.classList.remove('pool-drag-over'));
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('pool-drag-over');
      if (this.dragSource?.zone === 'slot') {
        this.moveToPool(this.dragSource.slotIndex);
      }
    });

    section.appendChild(area);
    return section;
  }

  private createPoolCard(pokemonIdx: number): HTMLElement {
    const pkm = this.pokemon[pokemonIdx];
    const card = document.createElement('div');
    card.className = 'pool-card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('tabindex', '0');

    const isSelected =
      this.selected?.zone === 'pool' && this.selected.pokemonIdx === pokemonIdx;
    if (isSelected) card.classList.add('pool-card--selected');

    const img = document.createElement('img');
    img.src = pkm.sprite;
    img.alt = pkm.name;
    img.className = 'pool-sprite';
    img.loading = 'lazy';
    card.appendChild(img);

    const name = document.createElement('div');
    name.className = 'pool-name';
    name.textContent = getName(pkm.id, formatName(pkm.name));
    card.appendChild(name);

    const types = document.createElement('div');
    types.className = 'pool-types';
    for (const t of pkm.types) {
      const pill = document.createElement('span');
      pill.className = 'type-pill';
      pill.textContent = getTypeName(t);
      pill.style.backgroundColor = TYPE_COLORS[t] ?? '#888';
      types.appendChild(pill);
    }
    card.appendChild(types);

    const badges = buildBadges(pkm);
    if (badges) card.appendChild(badges);

    card.addEventListener('dragstart', (e) => {
      this.dragSource = { zone: 'pool', pokemonIdx };
      card.classList.add('card-dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      this.dragSource = null;
      card.classList.remove('card-dragging');
    });

    card.addEventListener('touchstart', (e) =>
      this.onTouchStart(e, { zone: 'pool', pokemonIdx }), { passive: false });
    card.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    card.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

    card.addEventListener('click', () => this.handlePoolCardClick(pokemonIdx));

    return card;
  }

  // ─── Slots ────────────────────────────────────────────────────────────────

  private renderSlots(): HTMLElement {
    const section = document.createElement('div');

    const label = document.createElement('div');
    label.className = 'pool-label';
    label.textContent = 'Meine Rangliste';
    section.appendChild(label);

    const list = document.createElement('div');
    list.className = 'slots-list';

    for (let i = 0; i < this.slots.length; i++) {
      list.appendChild(this.createSlotRow(i));
    }

    section.appendChild(list);
    return section;
  }

  private createSlotRow(slotIndex: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.dataset.slotIndex = String(slotIndex);

    // Rank badge
    const rank = document.createElement('div');
    rank.className = `slot-rank slot-rank--${slotIndex < 3 ? ['gold', 'silver', 'bronze'][slotIndex] : 'default'}`;
    rank.textContent = `#${slotIndex + 1}`;
    row.appendChild(rank);

    const content = this.slots[slotIndex];

    if (content !== null) {
      row.classList.add('slot-row--filled');
      row.appendChild(this.createSlotContent(content, slotIndex));
    } else {
      const ph = document.createElement('div');
      ph.className = 'slot-empty';
      ph.textContent = 'Pokémon hierher ziehen';
      row.appendChild(ph);
    }

    // Drop events on whole row
    row.addEventListener('dragover', (e) => {
      if (!this.dragSource) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      row.classList.add('slot-row--over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('slot-row--over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('slot-row--over');
      if (this.dragSource) this.dropOnSlot(slotIndex);
    });

    // Click on empty area
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.slot-content') || target.closest('.slot-remove')) return;
      if (content === null) this.handleEmptySlotClick(slotIndex);
    });

    return row;
  }

  private createSlotContent(pokemonIdx: number, slotIndex: number): HTMLElement {
    const pkm = this.pokemon[pokemonIdx];
    const content = document.createElement('div');
    content.className = 'slot-content';
    content.setAttribute('draggable', 'true');

    const isSelected =
      this.selected?.zone === 'slot' && this.selected.slotIndex === slotIndex;
    if (isSelected) content.classList.add('slot-content--selected');

    const img = document.createElement('img');
    img.src = pkm.sprite;
    img.alt = pkm.name;
    img.className = 'slot-sprite';
    img.loading = 'lazy';
    content.appendChild(img);

    const info = document.createElement('div');
    info.className = 'slot-info';

    const nameRow = document.createElement('div');
    nameRow.style.display = 'flex';
    nameRow.style.alignItems = 'center';
    nameRow.style.gap = '6px';

    const name = document.createElement('div');
    name.className = 'slot-name';
    name.textContent = getName(pkm.id, formatName(pkm.name));
    nameRow.appendChild(name);

    const badges = buildBadges(pkm);
    if (badges) nameRow.appendChild(badges);
    info.appendChild(nameRow);

    const types = document.createElement('div');
    types.className = 'slot-types';
    for (const t of pkm.types) {
      const pill = document.createElement('span');
      pill.className = 'type-pill';
      pill.textContent = getTypeName(t);
      pill.style.backgroundColor = TYPE_COLORS[t] ?? '#888';
      types.appendChild(pill);
    }
    info.appendChild(types);

    const meta = document.createElement('div');
    meta.className = 'slot-meta';
    meta.textContent = `#${pkm.id} · Gen ${pkm.generation}`;
    info.appendChild(meta);

    content.appendChild(info);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'slot-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Zurück in Pool';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.moveToPool(slotIndex);
    });
    content.appendChild(removeBtn);

    content.addEventListener('dragstart', (e) => {
      this.dragSource = { zone: 'slot', slotIndex };
      content.classList.add('card-dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    content.addEventListener('dragend', () => {
      this.dragSource = null;
      content.classList.remove('card-dragging');
    });

    content.addEventListener('touchstart', (e) =>
      this.onTouchStart(e, { zone: 'slot', slotIndex }), { passive: false });
    content.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    content.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

    content.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.slot-remove')) return;
      this.handleSlotCardClick(slotIndex);
    });

    return content;
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  private renderActions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'sorter-actions';

    const filled = this.slots.filter((s) => s !== null).length;
    const total = this.slots.length;
    const allFilled = filled === total;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    if (!allFilled) {
      confirmBtn.classList.add('btn-primary--dim');
      confirmBtn.textContent = `Bestätigen · ${filled} / ${total}`;
    } else {
      confirmBtn.textContent = 'Bestätigen';
    }
    confirmBtn.disabled = !allFilled;
    confirmBtn.addEventListener('click', () => this.handleSubmit());

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn btn-secondary';
    skipBtn.textContent = 'Überspringen';
    skipBtn.addEventListener('click', () => this.onSkip());

    actions.appendChild(confirmBtn);
    actions.appendChild(skipBtn);
    return actions;
  }

  // ─── Drag/drop logic ──────────────────────────────────────────────────────

  private dropOnSlot(targetSlotIndex: number): void {
    if (!this.dragSource) return;

    if (this.dragSource.zone === 'pool') {
      const pokemonIdx = this.dragSource.pokemonIdx;
      const displaced = this.slots[targetSlotIndex];
      this.slots[targetSlotIndex] = pokemonIdx;
      this.pool = this.pool.filter((i) => i !== pokemonIdx);
      if (displaced !== null) this.pool.push(displaced);
    } else {
      const src = this.dragSource.slotIndex;
      if (src === targetSlotIndex) return;
      const temp = this.slots[targetSlotIndex];
      this.slots[targetSlotIndex] = this.slots[src];
      this.slots[src] = temp;
    }

    this.dragSource = null;
    this.renderUI();
  }

  private moveToPool(slotIndex: number): void {
    const idx = this.slots[slotIndex];
    if (idx === null) return;
    this.pool.push(idx);
    this.slots[slotIndex] = null;
    this.dragSource = null;
    this.renderUI();
  }

  // ─── Click-to-place ───────────────────────────────────────────────────────

  private handlePoolCardClick(pokemonIdx: number): void {
    if (this.selected?.zone === 'pool' && this.selected.pokemonIdx === pokemonIdx) {
      this.selected = null;
    } else if (this.selected?.zone === 'slot') {
      const slotIndex = this.selected.slotIndex;
      const displaced = this.slots[slotIndex];
      this.slots[slotIndex] = pokemonIdx;
      this.pool = this.pool.filter((i) => i !== pokemonIdx);
      if (displaced !== null) this.pool.push(displaced);
      this.selected = null;
    } else {
      this.selected = { zone: 'pool', pokemonIdx };
    }
    this.renderUI();
  }

  private handleSlotCardClick(slotIndex: number): void {
    if (this.selected?.zone === 'slot' && this.selected.slotIndex === slotIndex) {
      this.selected = null;
    } else if (this.selected?.zone === 'pool') {
      const pokemonIdx = this.selected.pokemonIdx;
      const displaced = this.slots[slotIndex];
      this.slots[slotIndex] = pokemonIdx;
      this.pool = this.pool.filter((i) => i !== pokemonIdx);
      if (displaced !== null) this.pool.push(displaced);
      this.selected = null;
    } else if (this.selected?.zone === 'slot') {
      const src = this.selected.slotIndex;
      const temp = this.slots[slotIndex];
      this.slots[slotIndex] = this.slots[src];
      this.slots[src] = temp;
      this.selected = null;
    } else {
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
      const src = this.selected.slotIndex;
      this.slots[slotIndex] = this.slots[src];
      this.slots[src] = null;
      this.selected = null;
      this.renderUI();
    }
  }

  // ─── Touch ────────────────────────────────────────────────────────────────

  private onTouchStart(e: TouchEvent, source: DragSource): void {
    e.preventDefault();
    this.dragSource = source;
    this.selected = null;

    const el = e.currentTarget as HTMLElement;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.cssText =
      `position:fixed;pointer-events:none;opacity:0.85;z-index:9999;width:${el.offsetWidth}px;border-radius:10px;`;
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

    this.clearDropHighlights();
    const el = document.elementFromPoint(t.clientX, t.clientY);
    el?.closest('.slot-row')?.classList.add('slot-row--over');
    el?.closest('.pool-area')?.classList.add('pool-drag-over');
  }

  private onTouchEnd(e: TouchEvent): void {
    if (this.touchClone) { document.body.removeChild(this.touchClone); this.touchClone = null; }
    this.clearDropHighlights();

    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);

    const slotRow = el?.closest('.slot-row') as HTMLElement | null;
    if (slotRow && this.dragSource) {
      const idx = parseInt(slotRow.dataset.slotIndex ?? '-1', 10);
      if (idx >= 0) { this.dropOnSlot(idx); return; }
    }

    if (el?.closest('.pool-area') && this.dragSource?.zone === 'slot') {
      this.moveToPool(this.dragSource.slotIndex); return;
    }

    this.dragSource = null;
  }

  private moveTouchClone(x: number, y: number): void {
    if (!this.touchClone) return;
    this.touchClone.style.left = x - this.touchClone.offsetWidth / 2 + 'px';
    this.touchClone.style.top = y - this.touchClone.offsetHeight / 2 + 'px';
  }

  private clearDropHighlights(): void {
    this.container.querySelectorAll('.slot-row--over, .pool-drag-over')
      .forEach((el) => el.classList.remove('slot-row--over', 'pool-drag-over'));
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  private handleSubmit(): void {
    if (!this.slots.every((s) => s !== null)) return;
    const rankedIds = (this.slots as number[]).map((i) => this.pokemon[i].id);
    this.container.classList.add('submitting');
    setTimeout(() => {
      this.container.classList.remove('submitting');
      this.onSubmit(rankedIds);
    }, 250);
  }

  destroy(): void {
    this.container.innerHTML = '';
    if (this.touchClone) { document.body.removeChild(this.touchClone); this.touchClone = null; }
  }
}

function formatName(name: string): string {
  return name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
}

function buildBadges(pkm: PokemonFeatures): HTMLElement | null {
  const tags: { label: string; cls: string }[] = [];
  if (pkm.isStarter)        tags.push({ label: 'Starter',    cls: 'badge--starter'  });
  if (pkm.isPseudoLegendary)tags.push({ label: 'Pseudo',     cls: 'badge--pseudo'   });
  if (pkm.isLegendary)      tags.push({ label: 'Legendär',   cls: 'badge--legendary'});
  if (pkm.isMythical)       tags.push({ label: 'Mysteriös',  cls: 'badge--mythical' });
  if (tags.length === 0) return null;

  const wrap = document.createElement('div');
  wrap.className = 'badge-row';
  for (const t of tags) {
    const b = document.createElement('span');
    b.className = `pkm-badge ${t.cls}`;
    b.textContent = t.label;
    wrap.appendChild(b);
  }
  return wrap;
}
