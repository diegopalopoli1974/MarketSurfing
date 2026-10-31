// Ingreso, registro, recuperación y restauración de copia (todo local).
import { h, icon, clear } from '../ui/dom.js';
import { toast, modal, field, setBusy } from '../ui/components.js';
import * as Auth from '../core/auth.js';
import { passwordIssues, passwordStrength } from '../core/crypto.js';
import { begin } from '../app/session.js';
import { restoreBackupFlow } from '../app/backup.js';

export function renderLogin({ onSuccess }) {
  const root = h('div', { class: 'auth' });
  const brand = h('div', { class: 'auth-brand' }, h('img', { src: 'icons/icon.svg', alt: '', width: 64, height: 64 }), h('h1', {}, 'MarketSurfing'), h('p', {}, 'Aprovechá la ola: cuándo, dónde y qué marca conviene.'));
  const panel = h('div', { class: 'auth-panel' });
  root.append(brand, panel);

  const finish = async (sess) => {
    await begin(sess);
    onSuccess();
  };

  async function showAccounts() {
    const accounts = await Auth.listAccounts();
    if (!accounts.length) return showRegister(true);
    clear(panel).append(
      h('h2', {}, '¿Quién ingresa?'),
      h(
        'ul',
        { class: 'account-list' },
        accounts.map((a) => h('li', {}, h('button', { class: 'account-btn', onclick: () => showPassword(a) }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, a.displayName.slice(0, 1).toUpperCase()), h('span', {}, h('strong', {}, a.displayName), h('small', {}, `@${a.username}${a.role === 'admin' ? ' · administrador' : ''}`)), icon('chevron', { size: 18 }))))
      ),
      h('div', { class: 'auth-links' }, h('button', { class: 'btn btn-ghost', onclick: () => showRegister(false) }, icon('plus', { size: 18 }), 'Crear otra cuenta'), h('button', { class: 'btn btn-ghost', onclick: () => showRecover() }, 'Olvidé mi contraseña'), h('button', { class: 'btn btn-ghost', onclick: () => restoreBackupFlow(finish) }, icon('upload', { size: 18 }), 'Restaurar copia'))
    );
  }

  function showPassword(acc) {
    const pw = h('input', { type: 'password', class: 'input', autocomplete: 'current-password', required: true, id: 'login-pw' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Ingresar');
    const form = h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          setBusy(submit, true, 'Verificando…');
          try {
            await finish(await Auth.login(acc.id, pw.value));
          } catch (ex) {
            setBusy(submit, false);
            err.textContent = ex.message;
            pw.select();
          }
        },
      },
      h('div', { class: 'auth-who' }, h('span', { class: 'avatar' }, acc.displayName.slice(0, 1).toUpperCase()), h('div', {}, h('strong', {}, acc.displayName), h('small', {}, `@${acc.username}`))),
      field('Contraseña', passwordInput(pw)),
      err,
      submit
    );
    const bioBtn = acc.hasBio
      ? h(
          'button',
          {
            class: 'btn btn-secondary btn-block',
            type: 'button',
            onclick: async () => {
              try {
                await finish(await Auth.loginWithBiometrics(acc.id));
              } catch (ex) {
                err.textContent = ex.name === 'NotAllowedError' ? 'Se canceló la verificación biométrica.' : ex.message;
              }
            },
          },
          icon('finger'),
          'Ingresar con huella o rostro'
        )
      : null;
    clear(panel).append(h('button', { class: 'link-back', onclick: showAccounts }, icon('back', { size: 18 }), 'Otras cuentas'), form, bioBtn);
    setTimeout(() => (acc.hasBio ? bioBtn.focus() : pw.focus()), 50);
  }

  function showRegister(first) {
    const user = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, maxlength: 30 });
    const name = h('input', { class: 'input', autocomplete: 'nickname', maxlength: 40, placeholder: 'Cómo querés que te llamemos' });
    const pw = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', required: true });
    const pw2 = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', required: true });
    const meter = strengthMeter(pw, user);
    const err = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Crear cuenta');
    const form = h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          if (pw.value !== pw2.value) return (err.textContent = 'Las contraseñas no coinciden');
          setBusy(submit, true, 'Cifrando…');
          try {
            const { session, recoveryCode } = await Auth.register({ username: user.value, displayName: name.value, password: pw.value });
            await showRecoveryCode(recoveryCode);
            await finish(session);
            offerBiometrics(session.account);
          } catch (ex) {
            err.textContent = ex.message;
            setBusy(submit, false);
          }
        },
      },
      h('h2', {}, first ? 'Creá tu cuenta local' : 'Nueva cuenta en este dispositivo'),
      h('p', { class: 'muted small' }, 'Tus datos quedan sólo en este celular, cifrados con tu contraseña. No hay servidores ni sincronización en la nube.'),
      field('Usuario', user, 'Letras sin acentos, números, punto o guion'),
      field('Nombre visible (opcional)', name),
      field('Contraseña', passwordInput(pw), null),
      meter,
      field('Repetir contraseña', passwordInput(pw2)),
      err,
      submit
    );
    clear(panel).append(first ? null : h('button', { class: 'link-back', onclick: showAccounts }, icon('back', { size: 18 }), 'Volver'), form, first ? h('div', { class: 'auth-links' }, h('button', { class: 'btn btn-ghost', onclick: () => restoreBackupFlow(finish) }, icon('upload', { size: 18 }), 'Restaurar una copia de seguridad')) : null);
    setTimeout(() => user.focus(), 50);
  }

  function showRecover() {
    const user = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', required: true });
    const code = h('input', { class: 'input mono', autocapitalize: 'characters', spellcheck: 'false', required: true, placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX' });
    const pw = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', required: true });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Recuperar acceso');
    clear(panel).append(
      h('button', { class: 'link-back', onclick: showAccounts }, icon('back', { size: 18 }), 'Volver'),
      h(
        'form',
        {
          onsubmit: async (e) => {
            e.preventDefault();
            err.textContent = '';
            setBusy(submit, true, 'Verificando…');
            try {
              const { session, recoveryCode } = await Auth.recover(user.value, code.value, pw.value);
              await showRecoveryCode(recoveryCode, true);
              await finish(session);
            } catch (ex) {
              err.textContent = ex.message;
              setBusy(submit, false);
            }
          },
        },
        h('h2', {}, 'Recuperar acceso'),
        h('p', { class: 'muted small' }, 'Usá el código de recuperación que guardaste al crear la cuenta. Sin ese código los datos cifrados no se pueden recuperar (nadie tiene una copia de tu clave).'),
        field('Usuario', user),
        field('Código de recuperación', code),
        field('Nueva contraseña', passwordInput(pw)),
        strengthMeter(pw, user),
        err,
        submit
      )
    );
  }

  showAccounts();
  return root;
}

export function passwordInput(input) {
  const btn = h('button', { type: 'button', class: 'icon-btn pw-toggle', 'aria-label': 'Mostrar contraseña', onclick: () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    clear(btn).append(icon(show ? 'eyeOff' : 'eye', { size: 20 }));
  } }, icon('eye', { size: 20 }));
  return h('div', { class: 'pw-wrap' }, input, btn);
}

export function strengthMeter(pw, userInput) {
  const bar = h('div', { class: 'meter-bar' });
  const label = h('span', { class: 'meter-label' });
  const list = h('ul', { class: 'meter-issues' });
  const upd = () => {
    const st = passwordStrength(pw.value);
    bar.dataset.level = pw.value ? String(st.level) : '';
    label.textContent = pw.value ? `Seguridad: ${st.label}` : '';
    clear(list).append(...(pw.value ? passwordIssues(pw.value, userInput?.value || '') : []).map((i) => h('li', {}, i)));
  };
  pw.addEventListener('input', upd);
  userInput?.addEventListener('input', upd);
  return h('div', { class: 'meter', 'aria-live': 'polite' }, h('div', { class: 'meter-track' }, bar), label, list);
}

export function showRecoveryCode(code, renewed = false) {
  return new Promise((resolve) => {
    const ok = h('input', { type: 'checkbox', id: 'rc-ok' });
    const cont = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => (m.close(), resolve()) }, 'Continuar');
    ok.addEventListener('change', () => (cont.disabled = !ok.checked));
    const m = modal({
      title: renewed ? 'Nuevo código de recuperación' : 'Guardá tu código de recuperación',
      dismissable: false,
      content: h(
        'div',
        {},
        h('p', {}, 'Es la única forma de recuperar tus datos si olvidás la contraseña. Anotalo en papel o guardalo en un gestor de contraseñas. No se vuelve a mostrar.'),
        h('p', { class: 'recovery-code', 'aria-label': 'Código de recuperación' }, code),
        h('button', { class: 'btn btn-ghost', onclick: async () => { try { await navigator.clipboard.writeText(code); toast('Código copiado. Recordá borrarlo del portapapeles.', 'ok'); } catch { toast('No se pudo copiar', 'error'); } } }, 'Copiar'),
        h('label', { class: 'check' }, ok, h('span', {}, 'Ya guardé el código en un lugar seguro'))
      ),
      actions: [],
    });
    m.el.querySelector('.modal-body').append(h('div', { class: 'modal-foot' }, cont));
  });
}

async function offerBiometrics(account) {
  if (!(await Auth.bioPlatformAvailable())) return;
  modal({
    title: '¿Activar ingreso con huella?',
    content: h('p', {}, 'Podés desbloquear la app con la huella o el rostro de este celular. Tu contraseña sigue funcionando y la podés desactivar cuando quieras desde «Seguridad y cuenta».'),
    actions: [
      { label: 'Ahora no', value: false },
      {
        label: 'Activar',
        kind: 'primary',
        onClick: async (close) => {
          close();
          location.hash = '#/ajustes?bio=1';
        },
      },
    ],
  });
  void account;
}
