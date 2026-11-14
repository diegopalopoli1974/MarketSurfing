// Ayuda contextual: textos por pantalla y tooltips al pasar el mouse (o al enfocar con teclado).

export const HELP = {
  home: {
    title: 'Inicio',
    text: 'Es el punto de partida. Desde acá buscás la mejor compra para una lista, consultás los precios de un producto y accedés a cada función.',
    tips: ['«Buscar la mejor ola» calcula en qué comercio y qué día conviene comprar una lista.', '«Precios por producto» muestra qué comercios tienen un producto y a cuánto.', '«Promociones» muestra el calendario de descuentos de bancos y billeteras y las ofertas de los comercios.', 'El menú «Más» (abajo a la derecha, o a la izquierda en la notebook) tiene el perfil, las funciones de Colaborador y la seguridad.'],
  },
  lists: {
    title: 'Mis listas (CU-01)',
    text: 'Guardá los productos que comprás habitualmente con su cantidad. Cada vez que guardás (por un cambio de nombre, de productos, de cantidades o de marcas) se crea una nueva versión; en «Historial de versiones» podés restaurar una anterior, lo que también crea una versión nueva.',
    tips: ['El selector de marca de cada producto permite elegir otra marca equivalente o «Cualquier marca», que amplía la búsqueda: en cada comercio se toma la más barata.', 'Debajo de cada producto se ve en cuántos comercios tiene precio registrado; tocalo para ver dónde hay y a cuánto.', 'Mientras editás, la barra amarilla «Cambios sin guardar» te avisa que todavía no guardaste. Si intentás salir, la app te pregunta si querés guardar, descartar o seguir editando.', 'Eliminar una lista no borra sus versiones.'],
  },
  prices: {
    title: 'Precios por producto (CU-02)',
    text: 'Elegí un producto (una marca o «cualquier marca») y mirá todos los comercios que tienen precio registrado, ordenados del más barato al más caro, con su promoción, la fecha y la fuente del precio. Podés limitarlo a un radio alrededor de una ubicación o ver todos los comercios.',
    tips: ['El precio es el de lista; si hay una promoción que aplica hoy a una unidad (según tus programas de socios), se muestra el precio por unidad de hoy; debajo se listan todas las promociones vigentes del comercio para ese producto con su fuente.', 'Fuente «✓ ticket»: precio pagado en una compra real; «góndola»: reportado por un Colaborador en el local.', '«!» indica que un Colaborador reportó el producto sin stock en los últimos días.'],
  },
  search: {
    title: 'Buscar la mejor compra (CU-03)',
    text: 'Calcula, para la lista elegida, cuánto pagarías en cada comercio del radio y cada día, aplicando las promociones de los comercios (cantidad mínima, máximo de unidades, días, socios) y las de tus medios de pago (tipo, red, compra mínima y tope). Podés verlo en el mapa y en una lista, o en la tabla comercio × día (como las tarifas de pasajes).',
    tips: ['Mapa: muestra calles y barrios; verde es más barato y rojo más caro; el número es el puesto y al lado figura el nombre del comercio. Un «!» significa que a ese comercio le faltan productos y su total no se compara.', 'Cada resultado indica las promociones aplicadas y el descuento del medio de pago; en el detalle se ve producto por producto qué promoción se aplicó y por qué no se aplicaron las demás (día, cantidad mínima, socio, compra mínima, tope agotado o medio que no tenés).', '«Repartir la compra»: elegís el máximo de comercios, la distancia máxima a recorrer y el costo por km; opcionalmente también se reparte en distintos días. Se minimiza total + km del recorrido × costo por km (hay un ejemplo en «¿Cómo se pondera el traslado?»). Si ningún reparto entra en la distancia máxima, se muestra la mejor compra en un solo comercio.', 'Desde el detalle podés «Ahorrar más cambiando marcas» (CU-04) y «Confirmar opción» para ver cómo llegar.'],
  },
  profile: {
    title: 'Mi perfil de compra (CU-05)',
    text: 'Todo es opcional y privado (queda cifrado en este dispositivo). Sirve para que las búsquedas se ajusten a vos.',
    tips: ['Medios de pago: emisor, tipo (crédito, débito, billetera o efectivo) y red (Visa, Mastercard…), nunca números. Se usan para aplicar los descuentos de bancos y billeteras que exigen ese tipo o red.', 'Programas de socios: los programas de fidelidad de los que sos socio; habilitan las promociones «sólo socios».', 'Disponibilidad: días para comprar (opción «Mis días» en la búsqueda), recibir y colaborar.', 'Comercios: excluí cadenas o sucursales que no querés en los resultados.', 'Gamas: calificá marcas como Excelencia, Superior, Clásica o Esencial para el «modo experto».'],
  },
  gondola: {
    title: 'Reportar en góndola (CU-06)',
    text: 'Para Colaboradores. Estando dentro de la sucursal (a menos de 50 m, validado por GPS), contá por voz o texto el precio, la promoción o un faltante. La app lo interpreta y lo registra.',
    tips: ['Ejemplo: «La leche La Serenísima de 1 litro está a 1890, 2x1».', 'Si la interpretación no es segura, se abre un formulario para completar.', 'Si el precio está muy lejos del habitual, se te pide confirmarlo (posible error de tipeo); si lo confirmás se registra sin puntos.', 'Las promociones que reportás se aplican en las búsquedas durante 7 días. Las diferencias con lo publicado y los faltantes de productos en oferta bajan la reputación del comercio, que se ve en los resultados.'],
  },
  ticket: {
    title: 'Cargar ticket (CU-07)',
    text: 'Para Colaboradores. Cargá el ticket de una compra real: sus precios quedan como «verificados». Se controla que los ítems menos los descuentos coincidan con el total, que no tenga más de 30 días y que no esté repetido.',
    tips: ['Por cada línea podés indicar la promoción aplicada y su descuento, y para el ticket el medio de pago y su descuento o reintegro: así se arma tu reporte «Mis compras».', 'Cada línea tiene que asociarse a un producto del catálogo o descartarse.', 'Suma 2 puntos por línea, con un máximo de 30 por ticket y 3 tickets por día.'],
  },
  promos: {
    title: 'Promociones (CU-12)',
    text: 'Todas las promociones vigentes, con su detalle completo: las de medios de pago (emisor, tipo y red de la tarjeta, %, días, tope y su período, compra mínima, modalidad) y las de los comercios (producto o categoría, mecánica, cantidad mínima, máximo de unidades, días, vigencia, si requiere ser socio y otras condiciones).',
    tips: ['El calendario cadena × día muestra qué banco o billetera conviene cada día en cada cadena; en negrita, las que podés usar.', 'Cada promoción indica si la podés usar con tu perfil y, si no, por qué (por ejemplo, «requiere ser socio» o «no tenés ese medio»).', 'En la búsqueda (CU-03) se aplican automáticamente las que corresponden y se explica por qué no se aplicaron las demás.'],
  },
  promoadmin: {
    title: 'Gestionar promociones (CU-13)',
    text: 'Para Colaboradores nivel 2 y el Administrador. Alta, modificación y baja de promociones del comercio y de medios de pago, con todos sus datos. La vista previa muestra el texto con el que la verán los usuarios.',
    tips: ['Del comercio: elegí a qué aplica (un producto, cualquier marca de un producto, una categoría o toda la tienda), la mecánica (NxM, 2da unidad, %, precio especial), la cantidad mínima y el máximo de unidades.', 'De medio de pago: emisor, tipo y red, %, tope y su período (por compra, semana o mes), compra mínima y si es descuento en caja o reintegro.', 'Comunes: alcance (cadena o sucursal), días, vigencia, programa de socios requerido y otras condiciones.', 'También podés agregar una promoción justo después de cargar un precio (CU-10).'],
  },
  sync: {
    title: 'Sincronizar precios (CU-08)',
    text: 'Sólo para el Administrador. Actualiza los precios desde la fuente de demostración (automática una vez por día) o importando el archivo oficial de Precios Claros (SEPA).',
    tips: ['La importación SEPA toma sólo las sucursales dentro del radio elegido.', 'Si una fuente falla, sus datos quedan en cuarentena y no se tocan los precios vigentes.'],
  },
  reports: {
    title: 'Reportes (CU-09)',
    text: 'Información agregada y anónima de la zona elegida, y tus propias estadísticas de compra.',
    tips: ['Por marca: índice = precio promedio del mes ÷ precio promedio del mes base × 100 (mes base = primer mes con datos). Ranking de menor suba para premiar a la marca más estable.', 'Por rubro: promedio simple de las variaciones de los productos de cada categoría.', 'Mapa: promociones por sucursal y si sus precios están por encima o por debajo de la mediana de la zona.', 'Mis compras: gasto, promociones aprovechadas y beneficio de cada medio de pago, según los tickets que cargaste.'],
  },
  catalog: {
    title: 'Cargar comercios, productos y precios (CU-10)',
    text: 'Para Colaboradores nivel 2 y el Administrador. Permite cargar un precio a mano; si el comercio o el producto no existen, los das de alta en el mismo momento con «Nuevo comercio» o «Nuevo producto» y seguís con el precio.',
    tips: ['Comercios: ubicalos por dirección (ej.: «Bouchard 2855, Caseros») o con tu GPS estando en el local.', 'Productos: para que sean comparables entre marcas, asocialos a un «producto genérico» existente (misma categoría, presentación y unidad) o creá uno nuevo.', 'Precios: quedan como nueva versión con fecha; el anterior se conserva en el historial. Después de guardar podés agregarle una promoción (abre CU-13 con el comercio y el producto ya elegidos).', 'En «Mis cargas» podés revisar y eliminar lo que cargaste (el Administrador ve todas).'],
  },
  settings: {
    title: 'Seguridad y cuenta',
    text: 'Contraseña, ingreso con huella, código de recuperación, preferencias de pantalla, copia de seguridad cifrada y eliminación de la cuenta.',
    tips: ['Si olvidás la contraseña, sólo el código de recuperación permite recuperar los datos.', 'El Administrador asigna el nivel de Colaborador de cada cuenta del dispositivo (CU-11).'],
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
