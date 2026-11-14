// Ayuda contextual: textos por pantalla y tooltips al pasar el mouse (o al enfocar con teclado).

export const HELP = {
  home: {
    title: 'Inicio',
    text: 'Es el punto de partida. Desde acá buscás la mejor compra para una lista y accedés a cada función. Las tarjetas muestran un resumen (listas, alertas activas, puntos).',
    tips: ['«Buscar la mejor ola» calcula en qué comercio y qué día conviene comprar una lista.', 'El menú «Más» (abajo a la derecha, o a la izquierda en la notebook) tiene alertas, perfil, funciones de Colaborador y seguridad.'],
  },
  lists: {
    title: 'Mis listas (CU-01)',
    text: 'Guardá los productos que comprás habitualmente con su cantidad. Cada vez que guardás, se crea una nueva versión, así que podés volver atrás desde «Historial de versiones».',
    tips: ['Un producto puede ser de una marca concreta o «cualquier marca»: en ese caso la búsqueda elige la equivalente más barata de cada comercio.', '«Cambiar marca» reemplaza la marca por otra equivalente (misma categoría, presentación y unidad) y permite deshacer.', 'Eliminar una lista no borra sus versiones.'],
  },
  search: {
    title: 'Buscar la mejor compra (CU-03)',
    text: 'Calcula, para la lista elegida, cuánto pagarías en cada comercio del radio y cada día de la semana, aplicando ofertas por cantidad, descuentos del día y los de tus medios de pago.',
    tips: ['Mapa: verde es más barato y rojo más caro; el número indica el puesto. Un «!» significa que a ese comercio le faltan productos y su total no se compara.', '«Mejor día de cada comercio» muestra para cada comercio su día más conveniente; los chips de días comparan todos los comercios ese día.', '«Repartir la compra en varios comercios» asigna cada producto al comercio más barato, sumando un costo de traslado por km.', 'Desde el detalle de un comercio podés «Ahorrar más cambiando marcas» (CU-04) y «Confirmar opción» para ir al local o comprar online (CU-06).'],
  },
  alerts: {
    title: 'Alertas de precio (CU-02)',
    text: 'Elegí un producto (o «cualquier marca»), un precio tope o un porcentaje de descuento, un radio y hasta cuándo. Cuando un precio nuevo cumpla la condición, te avisamos con una notificación y en «Avisos recibidos».',
    tips: ['El punto de referencia puede ser tu GPS o una dirección escrita a mano (ej.: «Bouchard 2855, Caseros»).', 'No se repite el mismo aviso dentro de las 24 horas.', 'El precio tope tiene que ser coherente con el precio actual del producto.'],
  },
  profile: {
    title: 'Mi perfil de compra (CU-07)',
    text: 'Todo es opcional y privado (queda cifrado en este dispositivo). Sirve para que las búsquedas y alertas se ajusten a vos.',
    tips: ['Medios de pago: sólo tipo y emisor, nunca números. Se usan para aplicar descuentos bancarios y de billeteras.', 'Disponibilidad: días para comprar (opción «Mis días» en la búsqueda), recibir y colaborar.', 'Comercios: excluí cadenas o sucursales que no querés en los resultados.', 'Gamas: calificá marcas como Excelencia, Superior, Clásica o Esencial para el «modo experto».'],
  },
  gondola: {
    title: 'Reportar en góndola (CU-08)',
    text: 'Para Colaboradores. Estando dentro de la sucursal (a menos de 50 m, validado por GPS), contá por voz o texto el precio, la promoción o un faltante. La app lo interpreta y lo registra.',
    tips: ['Ejemplo: «La leche La Serenísima de 1 litro está a 1890, 2x1 con Mercado Pago».', 'Si la interpretación no es segura, se abre un formulario para completar.', 'Precios fuera de rango quedan en revisión y no suman puntos.'],
  },
  ticket: {
    title: 'Cargar ticket (CU-09)',
    text: 'Para Colaboradores. Cargá el ticket de una compra real: sus precios quedan como «verificados». Se controla que la suma de ítems coincida con el total, que no tenga más de 30 días y que no esté repetido.',
    tips: ['Cada línea tiene que asociarse a un producto del catálogo o descartarse.', 'Suma 2 puntos por línea, con un máximo de 30 por ticket y 3 tickets por día.'],
  },
  catalog: {
    title: 'Cargar comercios, productos y precios (CU-12)',
    text: 'Para Colaboradores nivel 2 y el Administrador. Permite completar el catálogo a mano cuando falta un comercio, un producto o un precio. Lo cargado queda disponible para todas las cuentas de este dispositivo.',
    tips: ['Comercios: ubicalos por dirección (ej.: «Bouchard 2855, Caseros») o con tu GPS estando en el local.', 'Productos: para que sean comparables entre marcas, asocialos a un «producto genérico» existente (misma categoría, presentación y unidad) o creá uno nuevo.', 'Precios: quedan como nueva versión con fecha; el anterior se conserva en el historial.', 'En «Mis cargas» podés revisar y eliminar lo que cargaste.'],
  },
  sync: {
    title: 'Sincronizar precios (CU-10)',
    text: 'Sólo para el Administrador. Actualiza los precios desde la fuente de demostración (automática una vez por día) o importando el archivo oficial de Precios Claros (SEPA).',
    tips: ['La importación SEPA toma sólo las sucursales dentro del radio elegido.', 'Si una fuente falla, sus datos quedan en cuarentena y no se tocan los precios vigentes.'],
  },
  reports: {
    title: 'Reportes de mercado (CU-11)',
    text: 'Información agregada y anónima de la zona elegida.',
    tips: ['Por marca: índice base 100 de cada marca de un producto y ranking de menor suba (para premiar a la marca más estable).', 'Por rubro: variación de precios promedio de cada categoría.', 'Mapa: cantidad de promociones por sucursal y si sus precios están por encima o por debajo de la mediana de la zona.'],
  },
  settings: {
    title: 'Seguridad y cuenta',
    text: 'Contraseña, ingreso con huella, código de recuperación, preferencias de pantalla, copia de seguridad cifrada y eliminación de la cuenta.',
    tips: ['Si olvidás la contraseña, sólo el código de recuperación permite recuperar los datos.', 'El Administrador puede asignar el nivel de Colaborador de cada cuenta del dispositivo.'],
  },
  inbox: {
    title: 'Avisos recibidos',
    text: 'Lista de avisos de tus alertas de precio. También llegan como notificación si las permitiste.',
    tips: [],
  },
};

// ---------- Tooltips ----------
let tipEl = null;
let current = null;

function show(target) {
  const text = target.getAttribute('data-tip');
  if (!text) return;
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.id = 'ms-tooltip';
    document.body.append(tipEl);
  }
  current = target;
  tipEl.textContent = text;
  tipEl.hidden = false;
  target.setAttribute('aria-describedby', 'ms-tooltip');
  const r = target.getBoundingClientRect();
  const t = tipEl.getBoundingClientRect();
  let top = r.top - t.height - 8;
  if (top < 8) top = r.bottom + 8;
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(8, Math.min(window.innerWidth - t.width - 8, left));
  tipEl.style.top = `${Math.round(top)}px`;
  tipEl.style.left = `${Math.round(left)}px`;
}

function hide() {
  if (tipEl) tipEl.hidden = true;
  current?.removeAttribute('aria-describedby');
  current = null;
}

export function initTooltips() {
  let timer;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest?.('[data-tip]');
    if (!t || t === current) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(t), 350);
  });
  document.addEventListener('pointerout', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t && !t.contains(e.relatedTarget)) {
      clearTimeout(timer);
      hide();
    }
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t && t.matches(':focus-visible')) show(t);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
}
