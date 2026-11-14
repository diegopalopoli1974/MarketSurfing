// Ayuda contextual: textos por pantalla y tooltips al pasar el mouse (o al enfocar con teclado).

export const HELP = {
  home: {
    title: 'Inicio',
    text: 'Es el punto de partida. Desde acá buscás la mejor compra para una lista y accedés a cada función. Las tarjetas muestran un resumen (listas, alertas activas, puntos).',
    tips: ['«Buscar la mejor ola» calcula en qué comercio y qué día conviene comprar una lista.', 'El menú «Más» (abajo a la derecha, o a la izquierda en la notebook) tiene alertas, perfil, funciones de Colaborador y seguridad.'],
  },
  lists: {
    title: 'Mis listas (CU-01)',
    text: 'Guardá los productos que comprás habitualmente con su cantidad. Cada vez que guardás (por un cambio de nombre, de productos o de cantidades) se crea una nueva versión; en «Historial de versiones» podés restaurar una anterior, lo que también crea una versión nueva.',
    tips: ['Mientras editás, la barra amarilla «Cambios sin guardar» te avisa que todavía no guardaste. Si intentás salir, la app te pregunta si querés guardar, descartar o seguir editando.', 'Un producto puede ser de una marca concreta o «cualquier marca»: en ese caso la búsqueda elige la equivalente más barata de cada comercio.', '«Cambiar marca» reemplaza la marca por otra equivalente (misma categoría, presentación y unidad), la guarda como versión y permite deshacer.', 'Eliminar una lista no borra sus versiones.'],
  },
  search: {
    title: 'Buscar la mejor compra (CU-03)',
    text: 'Calcula, para la lista elegida, cuánto pagarías en cada comercio del radio y cada día, aplicando ofertas por cantidad, descuentos del día y los de tus medios de pago. Podés verlo en el mapa y en una lista, o en la tabla comercio × día (como las tarifas de pasajes).',
    tips: ['Mapa: muestra calles y barrios; verde es más barato y rojo más caro; el número es el puesto y al lado figura el nombre del comercio. Un «!» significa que a ese comercio le faltan productos y su total no se compara.', 'Cada resultado indica las ofertas aplicadas y el descuento del medio de pago; en el detalle se ve producto por producto y qué otros descuentos bancarios hay ese día.', '«Repartir la compra»: elegís el máximo de comercios, la distancia máxima a recorrer y el costo por km; opcionalmente también se reparte en distintos días. Se minimiza total + km del recorrido × costo por km (hay un ejemplo en «¿Cómo se pondera el traslado?»).', 'Desde el detalle podés «Ahorrar más cambiando marcas» (CU-04) y «Confirmar opción» para ver cómo llegar.'],
  },
  alerts: {
    title: 'Alertas de precio (CU-02)',
    text: 'Elegí un producto (o «cualquier marca»), un precio tope o un porcentaje de descuento, hasta cuándo y una o más zonas (barrios, localidades o direcciones, cada una con su radio). Cuando un precio nuevo de un comercio dentro de alguna zona cumpla la condición, te avisamos.',
    tips: ['Las zonas se buscan por nombre (ej.: «Caseros», «Palermo» o «Bouchard 2855, Caseros») o tocando el mapa. No se usa el GPS: la alerta vigila zonas fijas aunque te muevas.', 'No se repite el mismo aviso dentro de las 24 horas y, si un precio cumple en varios comercios, llega un único aviso con el mejor.', 'El precio tope tiene que ser coherente con el precio actual del producto.'],
  },
  profile: {
    title: 'Mi perfil de compra (CU-06)',
    text: 'Todo es opcional y privado (queda cifrado en este dispositivo). Sirve para que las búsquedas y alertas se ajusten a vos.',
    tips: ['Medios de pago: sólo tipo y emisor, nunca números. Se usan para aplicar descuentos bancarios y de billeteras.', 'Disponibilidad: días para comprar (opción «Mis días» en la búsqueda), recibir y colaborar.', 'Comercios: excluí cadenas o sucursales que no querés en los resultados.', 'Gamas: calificá marcas como Excelencia, Superior, Clásica o Esencial para el «modo experto».'],
  },
  gondola: {
    title: 'Reportar en góndola (CU-07)',
    text: 'Para Colaboradores. Estando dentro de la sucursal (a menos de 50 m, validado por GPS), contá por voz o texto el precio, la promoción o un faltante. La app lo interpreta y lo registra.',
    tips: ['Ejemplo: «La leche La Serenísima de 1 litro está a 1890, 2x1».', 'Si la interpretación no es segura, se abre un formulario para completar.', 'Si el precio está muy lejos del habitual, se te pide confirmarlo (posible error de tipeo); si lo confirmás se registra sin puntos.', 'Las promociones que reportás se aplican en las búsquedas durante 7 días. Las diferencias con lo publicado y los faltantes de productos en oferta bajan la reputación del comercio, que se ve en los resultados.'],
  },
  ticket: {
    title: 'Cargar ticket (CU-08)',
    text: 'Para Colaboradores. Cargá el ticket de una compra real: sus precios quedan como «verificados». Se controla que los ítems menos los descuentos coincidan con el total, que no tenga más de 30 días y que no esté repetido.',
    tips: ['Por cada línea podés indicar la promoción aplicada y su descuento, y para el ticket el medio de pago y su descuento o reintegro: así se arma tu reporte «Mis compras».', 'Cada línea tiene que asociarse a un producto del catálogo o descartarse.', 'Suma 2 puntos por línea, con un máximo de 30 por ticket y 3 tickets por día.'],
  },
  catalog: {
    title: 'Cargar comercios, productos y precios (CU-11)',
    text: 'Para Colaboradores nivel 2 y el Administrador. Permite cargar un precio a mano; si el comercio o el producto no existen, los das de alta en el mismo momento con «Nuevo comercio» o «Nuevo producto» y seguís con el precio.',
    tips: ['Comercios: ubicalos por dirección (ej.: «Bouchard 2855, Caseros») o con tu GPS estando en el local.', 'Productos: para que sean comparables entre marcas, asocialos a un «producto genérico» existente (misma categoría, presentación y unidad) o creá uno nuevo.', 'Precios: quedan como nueva versión con fecha; el anterior se conserva en el historial.', 'En «Mis cargas» podés revisar y eliminar lo que cargaste (el Administrador ve todas).'],
  },
  sync: {
    title: 'Sincronizar precios (CU-09)',
    text: 'Sólo para el Administrador. Actualiza los precios desde la fuente de demostración (automática una vez por día) o importando el archivo oficial de Precios Claros (SEPA).',
    tips: ['La importación SEPA toma sólo las sucursales dentro del radio elegido.', 'Si una fuente falla, sus datos quedan en cuarentena y no se tocan los precios vigentes.'],
  },
  reports: {
    title: 'Reportes (CU-10)',
    text: 'Información agregada y anónima de la zona elegida, y tus propias estadísticas de compra.',
    tips: ['Por marca: índice = precio promedio del mes ÷ precio promedio del mes base × 100 (mes base = primer mes con datos). Ranking de menor suba para premiar a la marca más estable.', 'Por rubro: promedio simple de las variaciones de los productos de cada categoría.', 'Mapa: promociones por sucursal y si sus precios están por encima o por debajo de la mediana de la zona.', 'Mis compras: gasto, promociones aprovechadas y beneficio de cada medio de pago, según los tickets que cargaste.'],
  },
  settings: {
    title: 'Seguridad y cuenta',
    text: 'Contraseña, ingreso con huella, código de recuperación, preferencias de pantalla, copia de seguridad cifrada y eliminación de la cuenta.',
    tips: ['Si olvidás la contraseña, sólo el código de recuperación permite recuperar los datos.', 'El Administrador asigna el nivel de Colaborador de cada cuenta del dispositivo (CU-13).'],
  },
  inbox: {
    title: 'Avisos recibidos',
    text: 'Lista de avisos de tus alertas de precio (CU-12). También llegan como notificación si las permitiste.',
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
