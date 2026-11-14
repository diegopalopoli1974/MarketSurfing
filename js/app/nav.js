// Protección de cambios sin guardar: una vista registra un guardián mientras tiene ediciones pendientes.
let guard = null;

/** g = { dirty: () => boolean, name: string, save: async () => boolean } | null */
export function setLeaveGuard(g) {
  guard = g;
}
export function leaveGuard() {
  return guard && guard.dirty() ? guard : null;
}

window.addEventListener('beforeunload', (e) => {
  if (leaveGuard()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
