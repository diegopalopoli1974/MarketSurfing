// Copia de seguridad cifrada (adaptación local de RNF-08): el archivo sólo contiene material cifrado.
import { h } from '../ui/dom.js';
import { modal, toast, field, setBusy } from '../ui/components.js';
import * as Auth from '../core/auth.js';
import * as UD from '../core/userdata.js';

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export async function downloadBackup(account) {
  const payload = {
    app: 'MarketSurfing',
    format: 1,
    createdAt: new Date().toISOString(),
    account: await Auth.exportAccountEnvelope(account.id),
    docs: await UD.exportBoxes(account.id),
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `marketsurfing-${account.username}-${new Date().toISOString().slice(0, 10)}.msbackup.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

export function restoreBackupFlow(onSession) {
  const file = h('input', { type: 'file', accept: '.json,application/json', class: 'input' });
  const pw = h('input', { type: 'password', class: 'input', autocomplete: 'current-password' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Restaurar');
  const m = modal({
    title: 'Restaurar copia de seguridad',
    content: h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          const f = file.files[0];
          if (!f) return (err.textContent = 'Elegí el archivo de copia');
          if (f.size > MAX_BACKUP_BYTES) return (err.textContent = 'El archivo es demasiado grande');
          setBusy(btn, true, 'Descifrando…');
          try {
            const data = JSON.parse(await f.text());
            if (data?.app !== 'MarketSurfing' || data.format !== 1 || !data.account?.pw) throw new Error('El archivo no es una copia válida de MarketSurfing');
            const sess = await Auth.importAccountEnvelope(data.account, pw.value);
            await UD.importBoxes(sess.account.id, data.docs || {});
            m.close();
            toast('Copia restaurada', 'ok');
            await onSession(sess);
          } catch (ex) {
            err.textContent = ex instanceof SyntaxError ? 'El archivo está dañado' : ex.message;
            setBusy(btn, false);
          }
        },
      },
      h('p', { class: 'muted small' }, 'Se crea la cuenta en este dispositivo con la contraseña que tenía al momento de la copia.'),
      field('Archivo (.msbackup.json)', file),
      field('Contraseña de esa cuenta', pw),
      err,
      btn
    ),
  });
}
