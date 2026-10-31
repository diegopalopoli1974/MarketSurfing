// CU-07 Gestionar Perfil de Compra (RF-13, RF-14, RF-19, RF-22). Todo opcional y privado (RNF-10).
import { h, icon, clear } from '../ui/dom.js';
import { pageHeader, card, toast, modal, segmented, field, steps, chip, confirmDialog } from '../ui/components.js';
import * as UD from '../core/userdata.js';
import * as Cat from '../data/catalog.js';
import * as L from '../app/listsvc.js';
import { PAYMENT_ISSUERS } from '../data/demo-seed.js';
import { DAYS, DAYS_SHORT, TIERS, tierName } from '../core/engine.js';

const REASONS = ['Precios altos', 'Mala atención', 'Faltantes frecuentes', 'Reputación baja', 'Difícil acceso', 'Promociones poco claras', 'Preferencia personal', 'Otro'];
const TYPE_LABEL = { billetera: 'Billetera virtual', banco: 'Banco', tarjeta: 'Tarjeta', programa: 'Programa de beneficios', efectivo: 'Efectivo' };

export async function render({ query }) {
  let tab = query.get('s') || 'pagos';
  const body = h('div');
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const draw = () => {
    clear(tabs);
    for (const [id, label, ic] of [
      ['pagos', 'Medios de pago', 'card'],
      ['dias', 'Disponibilidad', 'calendar'],
      ['excluidos', 'Comercios', 'ban'],
      ['gamas', 'Gamas', 'star'],
    ])
      tabs.append(h('button', { role: 'tab', class: ['tab', tab === id && 'active'], 'aria-selected': tab === id ? 'true' : 'false', onclick: () => ((tab = id), draw()) }, icon(ic, { size: 18 }), label));
    clear(body).append(tab === 'pagos' ? payments() : tab === 'dias' ? availability() : tab === 'excluidos' ? excluded(draw) : tiers());
  };
  draw();
  return h('div', { class: 'page' }, pageHeader('Mi perfil de compra', { subtitle: 'Opcional y privado: se usa para afinar búsquedas y alertas' }), tabs, body, steps('CU-07 · pasos 1–4 · A-1 · E-1'));
}

const confirmSaved = () => toast('Perfil actualizado', 'ok'); // paso 4

// (a) Medios de pago: sólo tipo y emisor, nunca números
function payments() {
  const pr = UD.get('profile');
  const listEl = h('ul', { class: 'chips wrap' });
  const draw = () => {
    clear(listEl);
    if (!pr.payments.length) listEl.append(h('li', { class: 'muted' }, 'No cargaste medios de pago.'));
    for (const p of pr.payments)
      listEl.append(h('li', {}, h('span', { class: 'chip chip-on' }, `${p.issuer} · ${TYPE_LABEL[p.type] || p.type}`, h('button', { class: 'chip-x', 'aria-label': `Quitar ${p.issuer}`, onclick: async () => {
        pr.payments = pr.payments.filter((x) => x !== p);
        await UD.save('profile');
        confirmSaved();
        draw();
      } }, '×'))));
  };
  draw();
  const sel = h('select', { class: 'input' }, h('option', { value: '' }, 'Elegí un medio…'), Object.entries(PAYMENT_ISSUERS).map(([name, type]) => h('option', { value: name }, `${name} (${TYPE_LABEL[type]})`)));
  const err = h('p', { class: 'form-error', role: 'alert' });
  return card(
    h('p', { class: 'muted small' }, 'Se guarda sólo el tipo y el emisor (por ejemplo «Mercado Pago · Billetera virtual»). Nunca números de tarjeta, de cuenta ni claves.'),
    listEl,
    h('div', { class: 'row' }, sel, h('button', { class: 'btn btn-secondary', onclick: async () => {
      err.textContent = '';
      const issuer = sel.value;
      // Paso 2: medio existente y sin datos sensibles
      if (!issuer || !PAYMENT_ISSUERS[issuer]) return (err.textContent = 'Elegí un medio de la lista');
      if (pr.payments.some((p) => p.issuer === issuer)) return (err.textContent = 'Ese medio ya está cargado');
      pr.payments.push({ type: PAYMENT_ISSUERS[issuer], issuer });
      await UD.save('profile'); // paso 3
      confirmSaved();
      sel.value = '';
      draw();
    } }, icon('plus', { size: 18 }), 'Agregar')),
    err
  );
}

// (b) Disponibilidad
function availability() {
  const pr = UD.get('profile');
  const av = structuredClone(pr.availability);
  av.slots = av.slots || {};
  const err = h('p', { class: 'form-error', role: 'alert' });
  const row = (key, label, hint) => {
    const chips = h('div', { class: 'chips' });
    const drawChips = () => {
      clear(chips);
      [1, 2, 3, 4, 5, 6, 0].forEach((d) => chips.append(chip(DAYS_SHORT[d], { active: av[key].includes(d), title: DAYS[d], onClick: () => ((av[key] = av[key].includes(d) ? av[key].filter((x) => x !== d) : [...av[key], d].sort()), drawChips()) })));
    };
    drawChips();
    const from = h('input', { type: 'time', class: 'input', value: av.slots[key]?.from || '', 'aria-label': `${label}: desde` });
    const to = h('input', { type: 'time', class: 'input', value: av.slots[key]?.to || '', 'aria-label': `${label}: hasta` });
    from.addEventListener('change', () => (av.slots[key] = { ...(av.slots[key] || {}), from: from.value }));
    to.addEventListener('change', () => (av.slots[key] = { ...(av.slots[key] || {}), to: to.value }));
    return h('fieldset', { class: 'fieldset' }, h('legend', {}, label), hint ? h('small', { class: 'hint' }, hint) : null, chips, h('div', { class: 'grid2' }, field('Desde (opcional)', from), field('Hasta (opcional)', to)));
  };
  return card(
    row('buy', 'Días para comprar', 'Se usan en la búsqueda con «Mis días».'),
    row('receive', 'Días para recibir compras'),
    row('verify', 'Días para verificar comercios', 'Al marcarlos te ofrecemos ser Verificador voluntario.'),
    h('p', { class: 'muted small' }, pr.verifier.enabled ? `Sos Verificador voluntario desde ${new Date(pr.verifier.consentAt).toLocaleDateString('es-AR')}.` : 'No sos Verificador.'),
    err,
    h('div', { class: 'row end' }, pr.verifier.enabled ? h('button', { class: 'btn btn-ghost', onclick: async () => {
      if (!(await confirmDialog('Dejar de ser Verificador', '¿Querés dejar el rol de Verificador voluntario? Ya no podrás reportar en góndola.', { ok: 'Dejar el rol' }))) return;
      pr.verifier = { enabled: false, consentAt: null };
      pr.availability.verify = [];
      await UD.save('profile');
      toast('Ya no sos Verificador', 'ok');
      location.reload();
    } }, 'Dejar el rol de Verificador') : null, h('button', { class: 'btn btn-primary', onclick: async () => {
      err.textContent = '';
      // Paso 2: franjas coherentes
      for (const [k, s] of Object.entries(av.slots)) if (s?.from && s?.to && s.from >= s.to) return (err.textContent = `Franja inválida en «${k === 'buy' ? 'comprar' : k === 'receive' ? 'recibir' : 'verificar'}»: «desde» debe ser anterior a «hasta»`);
      // A-1: consentimiento explícito para ser Verificador
      if (av.verify.length && !pr.verifier.enabled) {
        const ok = await verifierConsent();
        if (!ok) {
          av.verify = [];
          toast('No se guardaron los días de verificación', 'info');
        } else pr.verifier = { enabled: true, consentAt: Date.now() };
      }
      pr.availability = av;
      await UD.save('profile');
      confirmSaved();
    } }, icon('check'), 'Guardar disponibilidad'))
  );
}

function verifierConsent() {
  return new Promise((resolve) => {
    const chk = h('input', { type: 'checkbox' });
    const m = modal({
      title: 'Ser Verificador voluntario',
      content: h(
        'div',
        {},
        h('p', {}, 'Como Verificador vas a poder reportar precios, promociones y faltantes estando dentro de una sucursal (a menos de 50 m, validado por GPS).'),
        h('ul', { class: 'bullets' }, h('li', {}, 'Tu ubicación se usa sólo para validar la geocerca en el momento y no se guarda.'), h('li', {}, 'Los reportes se publican sin tu nombre y suman puntos según reglas públicas.'), h('li', {}, 'Podés dejar el rol cuando quieras.')),
        h('label', { class: 'check' }, chk, h('span', {}, 'Acepto participar como Verificador voluntario'))
      ),
      actions: [
        { label: 'No, gracias', value: false },
        { label: 'Aceptar', kind: 'primary', onClick: (close) => (chk.checked ? close(true) : toast('Marcá la casilla para aceptar', 'info')) },
      ],
      onClose: (v) => resolve(!!v),
    });
    void m;
  });
}

// (c) Comercios excluidos con motivo opcional
function excluded(redraw) {
  const pr = UD.get('profile');
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Buscar cadena, sucursal o barrio' });
  const res = h('ul', { class: 'pick-list compact' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const isEx = (kind, id) => pr.excluded.some((e) => e.kind === kind && e.id === id);
  const search = () => {
    clear(res);
    const n = norm(q.value.trim());
    if (!n) return;
    const chains = Cat.chains().filter((c) => norm(c.name).includes(n)).slice(0, 5);
    const stores = Cat.stores().filter((s) => norm(`${s.name} ${s.barrio} ${s.address}`).includes(n)).slice(0, 12);
    for (const c of chains) res.append(h('li', {}, h('button', { class: 'pick-item', disabled: isEx('chain', c.id), onclick: () => exclude('chain', c.id, `Cadena ${c.name}`) }, icon('store', { size: 18 }), h('span', {}, h('strong', {}, `Toda la cadena ${c.name}`), h('small', {}, isEx('chain', c.id) ? 'ya excluida' : 'excluir cadena completa')))));
    for (const s of stores) res.append(h('li', {}, h('button', { class: 'pick-item', disabled: isEx('store', s.id), onclick: () => exclude('store', s.id, s.name) }, icon('pin', { size: 18 }), h('span', {}, h('strong', {}, s.name), h('small', {}, `${s.address}${isEx('store', s.id) ? ' · ya excluida' : ''}`)))));
  };
  q.addEventListener('input', search);
  const exclude = (kind, id, name) => {
    const reason = h('select', { class: 'input' }, h('option', { value: '' }, 'Sin motivo'), REASONS.map((r) => h('option', { value: r }, r)));
    modal({
      title: `Excluir ${name}`,
      content: h('div', {}, h('p', {}, 'No se tendrá en cuenta en las búsquedas hasta que lo reincorpores.'), field('Motivo (opcional)', reason)),
      actions: [
        { label: 'Cancelar', value: null },
        {
          label: 'Excluir',
          kind: 'danger',
          onClick: async (close) => {
            const next = [...pr.excluded, { kind, id, name, reason: reason.value || null, at: Date.now() }];
            // Paso 2: debe quedar al menos un comercio habilitado (E-1)
            const exC = new Set(next.filter((e) => e.kind === 'chain').map((e) => e.id));
            const exS = new Set(next.filter((e) => e.kind === 'store').map((e) => e.id));
            if (!Cat.stores().some((s) => !exC.has(s.chainId) && !exS.has(s.id))) {
              close();
              err.textContent = 'No podés excluir todos los comercios: al menos uno debe quedar habilitado.';
              return;
            }
            pr.excluded = next;
            await UD.save('profile');
            close();
            confirmSaved();
            redraw();
          },
        },
      ],
    });
  };
  return card(
    h('p', { class: 'muted small' }, 'Excluí cadenas completas o sucursales de tu geocerca. Es una decisión personal: no afecta a otros usuarios.'),
    h('div', { class: 'row' }, q),
    res,
    err,
    h('h3', { class: 'h4' }, `Excluidos (${pr.excluded.length})`),
    pr.excluded.length
      ? h(
          'ul',
          { class: 'cards' },
          pr.excluded.map((e) => h('li', { class: 'row space ex-row' }, h('span', {}, h('strong', {}, e.name), h('small', { class: 'block muted' }, e.reason || 'Sin motivo')), h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
            pr.excluded = pr.excluded.filter((x) => x !== e);
            await UD.save('profile');
            toast('Comercio reincorporado', 'ok');
            redraw();
          } }, icon('undo', { size: 16 }), 'Reincorporar')))
        )
      : h('p', { class: 'muted' }, 'No excluiste comercios.')
  );
}

// (d) Gamas personales de calidad
function tiers() {
  const pr = UD.get('profile');
  const inLists = new Set(L.activeLists().flatMap((l) => L.currentItems(l).map((i) => i.generic)));
  let filter = 'listas';
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Filtrar productos' });
  const box = h('div');
  const draw = () => {
    clear(box);
    const n = q.value.toLowerCase();
    const gens = Cat.generics()
      .filter((g) => g.count > 1)
      .filter((g) => (filter === 'listas' ? inLists.has(g.key) : true))
      .filter((g) => !n || g.name.toLowerCase().includes(n))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!gens.length) box.append(h('p', { class: 'muted' }, filter === 'listas' ? 'Tus listas no tienen productos con varias marcas. Probá con «Todos».' : 'Sin resultados.'));
    for (const g of gens.slice(0, 60)) {
      box.append(
        h(
          'details',
          { class: 'tier-group' },
          h('summary', {}, `${g.name} ${g.presentation}`, h('small', { class: 'muted' }, ` · ${Cat.productsByGeneric(g.key).filter((p) => pr.tiers[p.id]).length}/${g.count} calificadas`)),
          h(
            'ul',
            {},
            Cat.productsByGeneric(g.key).map((p) => {
              const sel = h('select', { class: 'input', 'aria-label': `Gama de ${p.brand}` }, h('option', { value: '' }, 'Sin gama'), TIERS.map((t) => h('option', { value: t.id, selected: pr.tiers[p.id] === t.id }, t.name)));
              sel.addEventListener('change', async () => {
                if (sel.value) pr.tiers[p.id] = sel.value;
                else delete pr.tiers[p.id];
                await UD.save('profile');
                confirmSaved();
              });
              return h('li', { class: 'row space' }, h('span', {}, p.brand), sel);
            })
          )
        )
      );
    }
  };
  q.addEventListener('input', draw);
  draw();
  return card(
    h('p', { class: 'muted small' }, 'Calificá cada marca con tu propio criterio. Las gamas son privadas: nadie más puede verlas ni modificarlas, y se usan en el «modo experto».'),
    h('div', { class: 'tier-legend' }, TIERS.map((t) => h('span', { class: `tier tier-${t.id}` }, t.name))),
    segmented('tierfilter', [
      { value: 'listas', label: 'De mis listas' },
      { value: 'todos', label: 'Todos' },
    ], filter, (v) => ((filter = v), draw())),
    h('div', { class: 'row' }, q),
    box
  );
}
export { tierName };
