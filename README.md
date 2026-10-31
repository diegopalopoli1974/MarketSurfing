# MarketSurfing — PWA

Aplicación web progresiva que implementa el modelo UML del TP *MarketSurfing — Plataforma Geolocalizada de Comparación y Optimización de Compras* (Ingeniería de Software II).

Todo funciona **dentro del celular**: cuentas, base de datos y cálculos. No hay servidor ni nube. Los precios incluidos son **de demostración** (simulados con fines académicos).

## Publicar en GitHub Pages (gratis)

1. Creá un repositorio en GitHub (por ejemplo `marketsurfing`) y subí **todo el contenido de esta carpeta** a la raíz (incluido el archivo oculto `.nojekyll`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
3. En uno o dos minutos queda en `https://TU_USUARIO.github.io/marketsurfing/`.
4. En el celular abrí esa dirección con Chrome (Android) o Safari (iPhone) y elegí **Instalar app** / **Agregar a pantalla de inicio**.

> La app necesita HTTPS (GitHub Pages lo da) para cifrar, usar el GPS y funcionar sin conexión. También sirve Netlify o cualquier hosting estático.

Para probarla en la computadora: `python3 -m http.server 8080` dentro de la carpeta y abrir `http://localhost:8080`.

## Qué incluye (trazabilidad con el TP)

| CU | Pantalla | Notas de implementación |
|---|---|---|
| CU-01 Gestionar Listas | Listas | Versionado incremental, baja lógica (A-1), historial y restauración, escaneo de código de barras si el navegador lo soporta |
| CU-02 Alertas de umbral | Más → Alertas | Punto de referencia por GPS o manual; evaluación al actualizarse precios (CU-08/09/10); sin duplicados en 24 h; notificación local + bandeja |
| CU-03 Optimizar Compra | Buscar | Hoy / Mis días / Toda la semana, medios de pago, multi-comercio previo (A-2), mapa verde→rojo con «!» por faltante, recalcular sin faltantes (A-3) |
| CU-04 Optimizar Marcas | Buscar → detalle → «Ahorrar más…» | Ahorro objetivo (mínimo de cambios) y modo experto por gamas; nunca aplica sin aprobación; incluye CU-05 |
| CU-05 Sustituir Marca | Listas → «Cambiar marca» | Valida equivalencia (categoría, presentación, unidad), nueva versión y «Deshacer» |
| CU-06 Delivery | Confirmar opción → «Comprar online» | Genera el Cart Permalink de VTEX; no procesa pagos (SKU simulados en la demo) |
| CU-07 Perfil de compra | Más → Mi perfil | Medios de pago (sólo tipo y emisor), disponibilidad, comercios excluidos con motivo, gamas personales, consentimiento de Verificador (A-1) |
| CU-08 Reportar en góndola | Más → Reportar en góndola | Geocerca de 50 m por GPS (sin ingreso manual), dictado, intérprete local de texto coloquial, incidencias y reputación, puntos con topes |
| CU-09 Ticket por OCR | Más → Cargar ticket | Auditoría: CUIT, suma = total, antigüedad ≤ 30 días, huella anti duplicado; asociación manual (A-1) |
| CU-10 Sincronizar | Más → Sincronizar (administrador) | Adaptadores (demo y archivo SEPA/Precios Claros .zip/.csv), versiones inmutables, cuarentena ante errores, planificador diario al abrir la app |
| CU-11 Reportes | Reportes | Índice base 100 por marca y ranking de menor suba, variación por rubro, mapa de promociones; agregados y anónimos |

Cada pantalla muestra una etiqueta discreta con los pasos de la especificación que implementa (por ejemplo `CU-03 · pasos 1–10 · A-1 · A-3`).

### Adaptaciones por ser 100 % local

- **Servicios externos** del modelo: GPS real del teléfono; «Servicio IA (LLM)» → intérprete local de texto (no envía datos); «Notificaciones push» → notificaciones locales del service worker; «APIs de supermercados» → verificación con los precios locales; «Cron Daemon» → sincronización automática una vez por día al abrir la app.
- **Administrador**: la primera cuenta creada en el dispositivo.
- **Precios Claros**: el navegador no puede descargar el dataset directamente; se descarga el .zip de SEPA y se importa desde CU-10 filtrando por radio.
- **Presencia simulada** (Seguridad y cuenta → Demostración): permite mostrar CU-08 sin estar en un local; esos reportes no suman puntos.

## Seguridad

- Contraseñas: mínimo 10 caracteres, se rechazan comunes y las que contienen el usuario.
- Cifrado: cada cuenta tiene una clave aleatoria AES-256-GCM que cifra listas, alertas, perfil y actividad. Esa clave se guarda envuelta con una clave derivada de la contraseña (PBKDF2-SHA256, 600.000 iteraciones) y con otra derivada del **código de recuperación** (120 bits). Sin contraseña ni código, los datos no se pueden leer.
- Huella/rostro: passkey con la extensión **PRF** (Chrome Android, Safari iOS 18+); la huella desenvuelve la misma clave. Si el equipo no soporta PRF, la opción no se ofrece.
- Bloqueo automático por inactividad (configurable) y al volver de segundo plano; demora creciente tras 5 intentos fallidos.
- Sin `innerHTML` con datos: toda la interfaz se construye con nodos de texto. Content-Security-Policy estricta, sin scripts de terceros, sin referrer.
- Ubicación sólo en memoria (RNF-03), salvo el punto que el usuario elige para una alerta.
- Copia de seguridad cifrada descargable y eliminación de cuenta.

## OCR real (opcional)

Sin el motor instalado, CU-09 usa un formulario asistido. Para OCR en el teléfono, agregá [Tesseract.js](https://github.com/naptha/tesseract.js) v5 en `vendor/tesseract/`:

```
vendor/tesseract/tesseract.min.js
vendor/tesseract/worker.min.js
vendor/tesseract/core/          (archivos de tesseract.js-core: tesseract-core*.wasm.js)
vendor/tesseract/lang/spa.traineddata.gz
```

Con npm: `npm i tesseract.js @tesseract.js-data/spa` y copiar `node_modules/tesseract.js/dist/{tesseract.min.js,worker.min.js}`, `node_modules/tesseract.js-core/*` a `core/` y `node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz` a `lang/`. Se descarga al primer uso y queda guardado para usarse sin conexión.

## Estructura

```
index.html, manifest.webmanifest, sw.js   PWA (sw.js se genera con: node tools/build-sw.mjs)
css/app.css                                estilos (claro/oscuro, letra ajustable)
js/core/      crypto, auth, userdata (cifrado), idb, engine (motor), geo, nlp, ocr
js/data/      catalog (IndexedDB), demo-seed, sepa (lector ZIP/CSV)
js/app/       session, alerts, sync, listsvc, backup
js/views/     una vista por caso de uso
js/ui/        DOM seguro, componentes, mapa SVG, gráficos, selectores
```

Después de modificar archivos, regenerá `sw.js` (`node tools/build-sw.mjs`) para que los celulares reciban la nueva versión.
