import { h, icon, clear } from './dom.js';

let toastHost;
export function toast(msg, kind = 'info', ms = 3500) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const t = h('div', { class: `toast toast-${kind}` }, icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info', { size: 20 }), h('span', {}, msg));
  while (toastHost.children.length >= 2) toastHost.firstChild.remove();
  toastHost.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/** Diálogo modal accesible (usa <dialog>). Devuelve { el, close, body }. */
export function modal({ title, content, actions = [], onClose, wide = false, dismissable = true }) {
  const dlg = h('dialog', { class: ['modal', wide && 'modal-wide'], 'aria-labelledby': 'modal-title' });
  const close = (val) => {
    if (!dlg.open) return;
    dlg.close();
    dlg.remove();
    onClose?.(val);
  };
  const body = h('div', { class: 'modal-body' }, content);
  const head = h('header', { class: 'modal-head' }, h('h2', { id: 'modal-title' }, title), dismissable ? h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => close(null) }, icon('x')) : null);
  const foot = actions.length ? h('footer', { class: 'modal-foot' }, actions.map((a) => h('button', { class: ['btn', a.kind ? `btn-${a.kind}` : 'btn-ghost'], onclick: () => a.onClick ? a.onClick(close) : close(a.value) }, a.label))) : null;
  dlg.append(head, body, foot || '');
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (dismissable) close(null);
  });
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close, body };
}

export function confirmDialog(title, message, { ok = 'Aceptar', cancel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      content: h('p', {}, message),
      actions: [
        { label: cancel, value: false },
        { label: ok, value: true, kind: danger ? 'danger' : 'primary' },
      ],
      onClose: (v) => resolve(!!v),
    });
  });
}

export function promptPassword(title, message) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'password', class: 'input', autocomplete: 'current-password', 'aria-label': 'Contraseña' });
    const m = modal({
      title,
      content: h('form', { onsubmit: (e) => (e.preventDefault(), m.close(input.value)) }, h('p', {}, message), h('label', { class: 'field' }, h('span', {}, 'Contraseña'), input)),
      actions: [
        { label: 'Cancelar', value: null },
        { label: 'Confirmar', kind: 'primary', onClick: (close) => close(input.value) },
      ],
      onClose: (v) => resolve(v || null),
    });
    setTimeout(() => input.focus(), 50);
  });
}

export function pageHeader(title, { subtitle, back, actions } = {}) {
  return h(
    'header',
    { class: 'page-head' },
    back ? h('a', { class: 'icon-btn', href: back, 'aria-label': 'Volver' }, icon('back')) : null,
    h('div', { class: 'page-head-text' }, h('h1', {}, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
    actions ? h('div', { class: 'page-head-actions' }, actions) : null
  );
}

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}

export function empty(iconName, title, text, action) {
  return h('div', { class: 'empty' }, icon(iconName, { size: 40 }), h('h3', {}, title), text ? h('p', { class: 'muted' }, text) : null, action || null);
}

/** Grupo de opciones tipo "segmented control" con radio buttons reales (accesible). */
export function segmented(name, options, value, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'radiogroup' });
  for (const o of options) {
    const id = `${name}-${o.value}`;
    const input = h('input', { type: 'radio', name, id, value: o.value, checked: o.value === value, onchange: () => onChange(o.value) });
    wrap.append(h('div', { class: 'seg-opt' }, input, h('label', { for: id }, o.icon ? icon(o.icon, { size: 18 }) : null, o.label)));
  }
  return wrap;
}

export function chip(label, { active, onClick, title } = {}) {
  return h('button', { type: 'button', class: ['chip', active && 'chip-on'], 'aria-pressed': active ? 'true' : 'false', onclick: onClick, title }, label);
}

export function spinner(label = 'Cargando…') {
  return h('div', { class: 'spinner-wrap', role: 'status' }, h('div', { class: 'spinner' }), h('span', {}, label));
}

export function steps(code) {
  // pequeño indicador de trazabilidad con la especificación (CU / paso)
  return h('span', { class: 'trace', title: 'Paso de la especificación UML' }, code);
}

export function setBusy(btn, busy, labelBusy = 'Procesando…') {
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    clear(btn).append(h('span', { class: 'spinner sm' }), labelBusy);
  } else {
    btn.disabled = false;
    clear(btn).append(btn.dataset.label || '');
  }
}

export function card(...children) {
  return h('section', { class: 'card' }, ...children);
}
