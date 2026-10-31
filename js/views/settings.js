// Seguridad, cuenta, preferencias y privacidad.
import { h, icon } from '../ui/dom.js';
import { pageHeader, card, toast, modal, confirmDialog, promptPassword, field, segmented, setBusy } from '../ui/components.js';
import * as Auth from '../core/auth.js';
import * as UD from '../core/userdata.js';
import { session, lock, applyPrefs } from '../app/session.js';
import { downloadBackup } from '../app/backup.js';
import { passwordInput, strengthMeter, showRecoveryCode } from './login.js';
import { requestPushPermission } from '../app/alerts.js';

export async function render({ query, rerender }) {
  const acc = session.account;
  const prefs = UD.get('profile').prefs;
  const full = await Auth.getAccount(acc.id);
  const bioOk = await Auth.bioPlatformAvailable();

  const savePrefs = async (patch, msg = 'Preferencia guardada') => {
    Object.assign(prefs, patch);
    await UD.save('profile');
    applyPrefs();
    toast(msg, 'ok');
  };

  // Cambiar contraseña
  const cur = h('input', { type: 'password', class: 'input', autocomplete: 'current-password' });
  const nw = h('input', { type: 'password', class: 'input', autocomplete: 'new-password' });
  const nw2 = h('input', { type: 'password', class: 'input', autocomplete: 'new-password' });
  const pwErr = h('p', { class: 'form-error', role: 'alert' });
  const pwBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Cambiar contraseña');
  const pwForm = h('form', { onsubmit: async (e) => {
    e.preventDefault();
    pwErr.textContent = '';
    if (nw.value !== nw2.value) return (pwErr.textContent = 'Las contraseñas nuevas no coinciden');
    setBusy(pwBtn, true, 'Cifrando…');
    try {
      await Auth.changePassword(acc.id, cur.value, nw.value);
      toast('Contraseña actualizada', 'ok');
      cur.value = nw.value = nw2.value = '';
    } catch (ex) {
      pwErr.textContent = ex.message;
    } finally {
      setBusy(pwBtn, false);
    }
  } }, field('Contraseña actual', passwordInput(cur)), field('Nueva contraseña', passwordInput(nw)), strengthMeter(nw, { value: acc.username, addEventListener() {} }), field('Repetir nueva', passwordInput(nw2)), pwErr, h('div', { class: 'row end' }, pwBtn));

  const enableBio = async () => {
    const pw = await promptPassword('Activar huella', 'Confirmá tu contraseña para vincular la huella o el rostro de este celular.');
    if (!pw) return;
    try {
      await Auth.enableBiometrics(acc.id, pw);
      session.account.hasBio = true;
      toast('Ingreso con huella activado', 'ok');
      rerender();
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Se canceló la verificación' : e.message, 'error', 6000);
    }
  };
  if (query.get('bio') === '1' && bioOk && !full.bio) setTimeout(enableBio, 300);

  const autoLock = h('select', { class: 'input', onchange: (e) => savePrefs({ autoLockMin: Number(e.target.value) }) }, [1, 3, 5, 10, 15].map((m) => h('option', { value: m, selected: prefs.autoLockMin === m }, `${m} min`)));
  const radius = h('input', { type: 'number', class: 'input', min: 1, max: 15, value: prefs.radiusKm, onchange: (e) => savePrefs({ radiusKm: Math.min(15, Math.max(1, +e.target.value || 3)) }) });
  const costKm = h('input', { type: 'number', class: 'input', min: 0, max: 5000, step: 50, value: prefs.costPerKm, onchange: (e) => savePrefs({ costPerKm: Math.max(0, +e.target.value || 0) }) });
  const sim = h('input', { type: 'checkbox', checked: !!prefs.simulatePresence, onchange: (e) => savePrefs({ simulatePresence: e.target.checked }, e.target.checked ? 'Presencia simulada activada (sólo para demostración)' : 'Presencia simulada desactivada') });
  const act = UD.get('activity');

  return h(
    'div',
    { class: 'page' },
    pageHeader('Seguridad y cuenta', { subtitle: `@${acc.username}${acc.role === 'admin' ? ' · administrador' : ''}` }),
    card(
      h('h2', { class: 'h3' }, icon('shield'), ' Cómo se protegen tus datos'),
      h(
        'ul',
        { class: 'bullets' },
        h('li', {}, 'Todo queda en este celular: no hay servidores ni copias en la nube.'),
        h('li', {}, 'Tus listas, alertas, perfil y actividad se cifran con AES-256-GCM. La clave se deriva de tu contraseña (PBKDF2-SHA256, 600.000 iteraciones) y sólo vive en memoria mientras la app está desbloqueada.'),
        h('li', {}, 'La app se bloquea sola por inactividad y al volver de segundo plano. Tras 5 intentos fallidos el ingreso se demora cada vez más.'),
        h('li', {}, 'La ubicación se usa en el momento y no se guarda (salvo el punto de referencia que elijas para una alerta).'),
        h('li', {}, 'De los medios de pago sólo se guarda tipo y emisor; nunca números de tarjeta ni de cuenta.')
      )
    ),
    card(h('h2', { class: 'h3' }, 'Contraseña'), pwForm),
    card(
      h('h2', { class: 'h3' }, 'Ingreso con huella o rostro'),
      !bioOk ? h('p', { class: 'muted' }, 'Este dispositivo o navegador no ofrece autenticación biométrica para apps web.') : full.bio ? h('div', { class: 'row space' }, h('p', {}, '✓ Activado en este celular'), h('button', { class: 'btn btn-ghost', onclick: async () => {
        await Auth.disableBiometrics(acc.id);
        session.account.hasBio = false;
        toast('Huella desactivada', 'ok');
        rerender();
      } }, 'Desactivar')) : h('div', { class: 'row space' }, h('p', { class: 'muted small' }, 'Usa una passkey con la extensión PRF: la huella desbloquea la misma clave de cifrado, sin guardar tu contraseña.'), h('button', { class: 'btn btn-secondary', onclick: enableBio }, icon('finger'), 'Activar'))
    ),
    card(
      h('h2', { class: 'h3' }, 'Código de recuperación'),
      h('p', { class: 'muted small' }, 'Si lo perdiste, generá uno nuevo: el anterior deja de funcionar.'),
      h('div', { class: 'row end' }, h('button', { class: 'btn btn-secondary', onclick: async () => {
        const pw = await promptPassword('Nuevo código', 'Confirmá tu contraseña.');
        if (!pw) return;
        try {
          await showRecoveryCode(await Auth.regenerateRecovery(acc.id, pw), true);
        } catch (e) {
          toast(e.message, 'error');
        }
      } }, 'Generar nuevo código'))
    ),
    card(
      h('h2', { class: 'h3' }, 'Preferencias'),
      field('Bloqueo automático por inactividad', autoLock),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Tema'), segmented('theme', [
        { value: 'auto', label: 'Automático' },
        { value: 'light', label: 'Claro' },
        { value: 'dark', label: 'Oscuro' },
      ], prefs.theme, (v) => savePrefs({ theme: v }))),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Tamaño de letra'), segmented('font', [
        { value: '1', label: 'Normal' },
        { value: '1.15', label: 'Grande' },
        { value: '1.3', label: 'Muy grande' },
      ], String(prefs.fontScale || 1), (v) => savePrefs({ fontScale: Number(v) }))),
      h('div', { class: 'grid2' }, field('Radio por defecto (km)', radius), field('Costo de traslado por km ($)', costKm)),
      h('div', { class: 'row space' }, h('span', {}, 'Notificaciones de alertas'), h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => toast(`Permiso: ${({ granted: 'concedido', denied: 'denegado (cambialo en el navegador)', default: 'sin decidir', unsupported: 'no soportado' })[await requestPushPermission()]}`, 'info') }, 'Permitir'))
    ),
    card(
      h('h2', { class: 'h3' }, 'Demostración'),
      h('label', { class: 'check' }, sim, h('span', {}, 'Simular presencia en sucursal (CU-08)', h('small', { class: 'hint block' }, 'Permite probar el reporte en góndola sin estar en el local. Los reportes simulados no suman puntos.')))
    ),
    card(
      h('h2', { class: 'h3' }, `Puntos: ${act.points}`),
      h('p', { class: 'muted small' }, 'Reglas públicas: reporte válido 10 (+5 si registra una incidencia), ticket 2 por línea (máx. 30). Topes: 20 reportes y 3 tickets con puntos por día; mismo producto y sucursal, una vez cada 6 h.'),
      act.pointsLog.length ? h('ul', { class: 'log' }, act.pointsLog.slice(0, 10).map((p) => h('li', {}, `+${p.amount} · ${p.reason} · ${new Date(p.ts).toLocaleDateString('es-AR')}`))) : null
    ),
    card(
      h('h2', { class: 'h3' }, 'Tus datos'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-secondary', onclick: async () => {
          await downloadBackup(acc);
          toast('Copia cifrada descargada. Para restaurarla necesitás tu contraseña.', 'ok', 5000);
        } }, icon('download'), 'Descargar copia de seguridad cifrada'),
        h('button', { class: 'btn btn-ghost', onclick: async () => {
          if (!(await confirmDialog('Borrar perfil de compra', 'Se eliminan medios de pago, disponibilidad, comercios excluidos y gamas. Tus listas y alertas se mantienen.', { ok: 'Borrar', danger: true }))) return;
          await UD.update('profile', (p) => {
            p.payments = [];
            p.availability = { buy: [], receive: [], verify: [], slots: {} };
            p.verifier = { enabled: false, consentAt: null };
            p.excluded = [];
            p.tiers = {};
          });
          toast('Perfil de compra borrado', 'ok');
        } }, 'Borrar mi perfil de compra'),
        h('button', { class: 'btn btn-danger', onclick: async () => {
          const pw = await promptPassword('Eliminar cuenta', 'Se borran definitivamente la cuenta y todos sus datos de este dispositivo. Confirmá con tu contraseña.');
          if (!pw) return;
          if (!(await Auth.verifyPassword(acc.id, pw))) return toast('Contraseña incorrecta', 'error');
          if (!(await confirmDialog('¿Eliminar definitivamente?', 'Esta acción no se puede deshacer.', { ok: 'Eliminar cuenta', danger: true }))) return;
          await UD.destroy(acc.id);
          await Auth.deleteAccountRecord(acc.id);
          toast('Cuenta eliminada', 'ok');
          lock('borrada');
        } }, icon('trash'), 'Eliminar mi cuenta')
      )
    ),
    h('button', { class: 'btn btn-ghost btn-block', onclick: () => lock('manual') }, icon('lock'), 'Bloquear ahora'),
    h('p', { class: 'muted small center' }, 'MarketSurfing · Trabajo práctico de Ingeniería de Software II')
  );
  void modal;
}
