// CU-04 Optimizar Marcas de la Lista (ahorro objetivo / modo experto). Incluye CU-05 por cada cambio aprobado.
import { h, icon, clear } from '../ui/dom.js';
import { modal, toast, segmented, steps, field } from '../ui/components.js';
import * as E from '../core/engine.js';
import * as L from '../app/listsvc.js';
import * as Cat from '../data/catalog.js';
import * as UD from '../core/userdata.js';

const { money } = E;

export function openBrandOptimizer({ list, items, ctx, reference }) {
  return new Promise((resolve) => {
    let mode = 'target';
    let pct = 10;
    let tolerance = 1;
    let changed = false;
    const body = h('div');
    const m = modal({ title: 'Ahorrar más cambiando marcas', wide: true, content: body, onClose: () => resolve(changed) });

    // Paso 1: criterio
    const step1 = () => {
      const pctIn = h('input', { type: 'number', class: 'input', min: 1, max: 60, step: 1, value: pct, inputmode: 'numeric', onchange: (e) => (pct = Math.min(60, Math.max(1, Math.round(Number(e.target.value) || 10)))) });
      const tolSel = h('select', { class: 'input', onchange: (e) => (tolerance = Number(e.target.value)) }, [
        h('option', { value: 0, selected: tolerance === 0 }, 'Misma gama'),
        h('option', { value: 1, selected: tolerance === 1 }, 'Hasta una gama menos'),
        h('option', { value: 2, selected: tolerance === 2 }, 'Hasta dos gamas menos'),
      ]);
      const targetBox = h('div', {}, field('Porcentaje de ahorro buscado', pctIn, 'Se propone el mínimo de cambios que lo alcanza.'));
      const expertBox = h('div', { hidden: true }, field('Tolerancia de calidad', tolSel, 'Según tus gamas personales: Excelencia › Superior › Clásica › Esencial.'));
      clear(body).append(
        h('p', { class: 'muted small' }, `Precios de referencia: ${Cat.store(reference.storeId).name}, ${E.DAYS[reference.day].toLowerCase()}. Nunca se aplica un cambio sin tu aprobación.`),
        segmented('bmode', [
          { value: 'target', label: 'Ahorro objetivo' },
          { value: 'expert', label: 'Modo experto' },
        ], mode, (v) => ((mode = v), (targetBox.hidden = v !== 'target'), (expertBox.hidden = v !== 'expert'))),
        targetBox,
        expertBox,
        h('div', { class: 'row end' }, h('button', { class: 'btn btn-primary', onclick: compute }, 'Buscar sustituciones')),
        steps('CU-04 · paso 1')
      );
      expertBox.hidden = mode !== 'expert';
      targetBox.hidden = mode !== 'target';
    };

    // Pasos 2-3
    const compute = () => {
      const tiers = UD.get('profile').tiers;
      const r = E.proposeBrandChanges({ items, ctx, reference, mode, pct, tolerance, tiers });
      if (mode === 'expert' && r.unrated.length && !r._skipped) return rateUnrated(r.unrated);
      if (!r.proposal.length) {
        // E-1
        clear(body).append(h('div', { class: 'card warn' }, h('strong', {}, 'No hay sustituciones que ahorren'), h('p', {}, mode === 'expert' ? 'Dentro de la tolerancia de gamas elegida no hay marcas más baratas.' : 'No hay marcas equivalentes más baratas en este comercio.')), h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: step1 }, 'Cambiar criterio'), h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Volver a resultados')), steps('CU-04 · E-1'));
        return;
      }
      showProposal(r);
    };

    // A-1: ítems sin gama
    const rateUnrated = (ids) => {
      const tiers = { ...UD.get('profile').tiers };
      const rows = ids.map((id) => {
        const p = Cat.product(id);
        const sel = h('select', { class: 'input', 'aria-label': `Gama de ${p.name}`, onchange: (e) => (e.target.value ? (tiers[id] = e.target.value) : delete tiers[id]) }, [h('option', { value: '' }, 'Omitir'), ...E.TIERS.map((t) => h('option', { value: t.id }, t.name))]);
        return h('li', { class: 'row space' }, h('span', {}, p.name), sel);
      });
      clear(body).append(
        h('p', {}, 'Para el modo experto necesitás calificar estos productos con tus gamas personales (quedan guardadas en tu perfil, son privadas):'),
        h('ul', { class: 'rate-list' }, rows),
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: step1 }, 'Atrás'), h('button', { class: 'btn btn-primary', onclick: async () => {
          await UD.update('profile', (pr) => void (pr.tiers = tiers));
          const r = E.proposeBrandChanges({ items, ctx, reference, mode, pct, tolerance, tiers });
          r._skipped = true;
          if (!r.proposal.length) return compute2(r);
          showProposal(r);
        } }, 'Continuar')),
        steps('CU-04 · A-1')
      );
    };
    const compute2 = (r) => {
      void r;
      clear(body).append(h('div', { class: 'card warn' }, h('strong', {}, 'No hay sustituciones que ahorren'), h('p', {}, 'Con las gamas asignadas no hay alternativas más baratas dentro de la tolerancia.')), h('div', { class: 'row end' }, h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Volver a resultados')), steps('CU-04 · E-1'));
    };

    // Paso 4: propuesta y aprobación
    const showProposal = (r) => {
      const checks = r.proposal.map(() => h('input', { type: 'checkbox', checked: true }));
      const totalEl = h('p', { class: 'total-line' });
      const upd = () => {
        const s = r.proposal.reduce((a, row, i) => a + (checks[i].checked ? row.saving : 0), 0);
        totalEl.textContent = `Ahorro con los cambios aprobados: ${money(s)} (${E.pctFmt(r.baseTotal ? (s / r.baseTotal) * 100 : 0)} de ${money(r.baseTotal)})`;
      };
      checks.forEach((c) => c.addEventListener('change', upd));
      upd();
      clear(body).append(
        mode === 'target' && !r.reached ? h('p', { class: 'notice' }, icon('info'), `Con todas las sustituciones posibles se llega a ${E.pctFmt(r.pctAchieved)}, menos que el ${pct} % buscado.`) : null,
        h(
          'ul',
          { class: 'proposal' },
          r.proposal.map((row, i) =>
            h(
              'li',
              {},
              h('label', { class: 'check' }, checks[i], h('span', {}, h('strong', {}, `${row.from.brand} → ${row.to.brand}`), h('small', {}, `${row.from.genericName} ${row.from.presentation} · ${money(row.fromCost)} → ${money(row.toCost)}`), mode === 'expert' || row.fromTier || row.toTier ? h('small', {}, `Gama: ${E.tierName(row.fromTier)} → ${E.tierName(row.toTier)}`) : null)),
              h('strong', { class: 'good' }, `−${money(row.saving)}`)
            )
          )
        ),
        totalEl,
        h(
          'div',
          { class: 'row end' },
          h('button', { class: 'btn', onclick: () => (toast('La lista queda sin cambios', 'info'), m.close()) }, 'No aplicar ninguno'),
          h('button', { class: 'btn btn-primary', onclick: async () => {
            const approved = r.proposal.filter((_, i) => checks[i].checked);
            if (!approved.length) return (toast('La lista queda sin cambios', 'info'), m.close()); // A-2
            // Paso 5: INCLUYE CU-05 por cada cambio aprobado
            let saved = 0;
            for (const row of approved) {
              try {
                await L.substituteBrand(list.id, row.item.generic, row.to.id, 'CU-04');
                saved += row.saving;
              } catch (e) {
                toast(e.message, 'error');
              }
            }
            changed = true;
            // Paso 6
            clear(body).append(h('div', { class: 'banner good' }, icon('check'), h('div', {}, h('strong', {}, `Aplicaste ${approved.length} cambio(s) de marca`), h('span', {}, `Ahorro logrado: ${money(saved)}. La búsqueda se recalcula con la lista actualizada.`))), h('div', { class: 'row end' }, h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Ver resultados actualizados')), steps('CU-04 · pasos 5–6 (incluye CU-05)'));
          } }, 'Aplicar seleccionados')
        ),
        steps('CU-04 · paso 4 · A-2')
      );
    };

    step1();
  });
}
