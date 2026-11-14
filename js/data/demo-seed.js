// Datos de DEMOSTRACIÓN: cadenas, sucursales, productos, precios (12 meses) y promociones.
// Todo es simulado de forma determinística (semilla fija) para que los resultados sean reproducibles.
// Los EAN usan el prefijo 20 (circulación interna) para no chocar con códigos reales al importar SEPA.

export function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CHAINS = [
  { id: 'carrefour', name: 'Carrefour', factor: 0.98, online: true, platform: 'vtex', host: 'www.carrefour.com.ar' },
  { id: 'coto', name: 'Coto', factor: 1.0, online: true, platform: 'propia', host: 'www.cotodigital.com.ar' },
  { id: 'dia', name: 'Día', factor: 0.93, online: true, platform: 'vtex', host: 'diaonline.supermercadosdia.com.ar' },
  { id: 'jumbo', name: 'Jumbo', factor: 1.08, online: true, platform: 'vtex', host: 'www.jumbo.com.ar' },
  { id: 'disco', name: 'Disco', factor: 1.06, online: true, platform: 'vtex', host: 'www.disco.com.ar' },
  { id: 'vea', name: 'Vea', factor: 0.97, online: true, platform: 'vtex', host: 'www.vea.com.ar' },
  { id: 'changomas', name: 'ChangoMás', factor: 0.95, online: true, platform: 'vtex', host: 'www.masonline.com.ar' },
  { id: 'barrio', name: 'Autoservicio de barrio', factor: 1.01, online: false, platform: null, host: null },
];

// [clave, nombre genérico, rubro, presentación, cantidad, unidad, precio base, [[marca, multiplicador], ...]]
const G = [
  ['leche-entera-1l', 'Leche entera', 'Lácteos', '1 L', 1, 'l', 1700, [['La Serenísima', 1.15], ['Sancor', 1.05], ['Milkaut', 0.95], ['Las Tres Niñas', 0.88]]],
  ['leche-desc-1l', 'Leche descremada', 'Lácteos', '1 L', 1, 'l', 1750, [['La Serenísima', 1.15], ['Sancor', 1.04], ['Milkaut', 0.94]]],
  ['yogur-bebible-1l', 'Yogur bebible frutilla', 'Lácteos', '1 L', 1, 'l', 2300, [['La Serenísima', 1.12], ['Sancor', 1.03], ['Ilolay', 0.92]]],
  ['queso-cremoso-kg', 'Queso cremoso', 'Lácteos', '1 kg', 1, 'kg', 9800, [['La Paulina', 1.12], ['Sancor', 1.05], ['Milkaut', 0.97], ['Punta del Agua', 0.9]]],
  ['manteca-200', 'Manteca', 'Lácteos', '200 g', 0.2, 'kg', 2900, [['La Serenísima', 1.12], ['Sancor', 1.03], ['Tonadita', 0.88]]],
  ['dulce-leche-400', 'Dulce de leche clásico', 'Lácteos', '400 g', 0.4, 'kg', 2400, [['La Serenísima', 1.14], ['Sancor', 1.05], ['Ilolay', 0.94], ['Milkaut', 0.92]]],
  ['fideos-spaghetti-500', 'Fideos spaghetti', 'Almacén', '500 g', 0.5, 'kg', 1300, [['Matarazzo', 1.25], ['Don Vicente', 1.15], ['Lucchetti', 1.0], ['Marolio', 0.75]]],
  ['arroz-largo-1kg', 'Arroz largo fino', 'Almacén', '1 kg', 1, 'kg', 1600, [['Gallo', 1.2], ['Molinos Ala', 0.97], ['Dos Hermanos', 1.0], ['Marolio', 0.8]]],
  ['harina-000-1kg', 'Harina de trigo 000', 'Almacén', '1 kg', 1, 'kg', 900, [['Blancaflor', 1.15], ['Pureza', 1.1], ['Favorita', 0.95], ['Marolio', 0.8]]],
  ['azucar-1kg', 'Azúcar común', 'Almacén', '1 kg', 1, 'kg', 1200, [['Ledesma', 1.1], ['Chango', 1.0], ['Marolio', 0.85]]],
  ['aceite-girasol-15', 'Aceite de girasol', 'Almacén', '1,5 L', 1.5, 'l', 3200, [['Natura', 1.12], ['Cocinero', 1.05], ['Cañuelas', 0.95], ['Marolio', 0.82]]],
  ['yerba-1kg', 'Yerba mate con palo', 'Almacén', '1 kg', 1, 'kg', 4800, [['Playadito', 1.1], ['Taragüí', 1.08], ['Rosamonte', 1.04], ['Unión', 0.95]]],
  ['cafe-molido-500', 'Café molido', 'Almacén', '500 g', 0.5, 'kg', 6500, [['Cabrales', 1.25], ['Bonafide', 1.15], ['La Virginia', 1.08], ['Arlistán', 0.95]]],
  ['te-50', 'Té en saquitos x50', 'Almacén', '50 u', 50, 'u', 1100, [['La Virginia', 1.05], ['Taragüí', 1.0], ['Green Hills', 0.9]]],
  ['pan-lactal-550', 'Pan lactal blanco', 'Almacén', '550 g', 0.55, 'kg', 2800, [['Bimbo', 1.1], ['Fargo', 1.05], ['Lactal', 1.0]]],
  ['tomate-triturado-520', 'Tomate triturado', 'Almacén', '520 g', 0.52, 'kg', 900, [['La Campagnola', 1.1], ['Arcor', 1.0], ['Noel', 0.95], ['Marolio', 0.75]]],
  ['mayonesa-475', 'Mayonesa', 'Almacén', '475 g', 0.475, 'kg', 2300, [['Hellmann’s', 1.2], ['Natura', 1.0], ['Fanacoa', 0.9]]],
  ['galletitas-crackers-300', 'Galletitas crackers', 'Almacén', '300 g', 0.3, 'kg', 1200, [['Granix', 1.15], ['Express', 1.05], ['Criollitas', 1.0]]],
  ['mermelada-390', 'Mermelada de durazno', 'Almacén', '390 g', 0.39, 'kg', 1900, [['La Campagnola', 1.1], ['Arcor', 1.0], ['Dulcor', 0.9]]],
  ['atun-170', 'Atún al natural', 'Almacén', '170 g', 0.17, 'kg', 2600, [['Gomes da Costa', 1.15], ['La Campagnola', 1.1], ['Marolio', 0.8]]],
  ['polenta-500', 'Polenta instantánea', 'Almacén', '500 g', 0.5, 'kg', 900, [['Presto Pronta', 1.1], ['Exquisita', 1.0], ['Marolio', 0.8]]],
  ['gaseosa-cola-225', 'Gaseosa cola', 'Bebidas', '2,25 L', 2.25, 'l', 3200, [['Coca-Cola', 1.25], ['Pepsi', 1.05], ['Cunnington', 0.7], ['Manaos', 0.6]]],
  ['agua-mineral-2l', 'Agua mineral sin gas', 'Bebidas', '2 L', 2, 'l', 1400, [['Villavicencio', 1.1], ['Villa del Sur', 1.05], ['Eco de los Andes', 1.0], ['Glaciar', 0.95]]],
  ['cerveza-lata-473', 'Cerveza rubia lata', 'Bebidas', '473 ml', 0.473, 'l', 1500, [['Stella Artois', 1.3], ['Quilmes', 1.0], ['Brahma', 0.95]]],
  ['jugo-polvo-18', 'Jugo en polvo naranja', 'Bebidas', '18 g', 0.018, 'kg', 350, [['Clight', 1.15], ['Tang', 1.1], ['Arcor', 0.9]]],
  ['lavandina-1l', 'Lavandina', 'Limpieza', '1 L', 1, 'l', 900, [['Ayudín', 1.1], ['Querubín', 0.9]]],
  ['detergente-500', 'Detergente lavavajillas', 'Limpieza', '500 ml', 0.5, 'l', 1600, [['Magistral', 1.2], ['Cif', 1.1], ['Ala', 1.0], ['Marolio', 0.8]]],
  ['jabon-polvo-800', 'Jabón en polvo', 'Limpieza', '800 g', 0.8, 'kg', 4500, [['Ariel', 1.2], ['Skip', 1.15], ['Ala', 1.0], ['Zorro', 0.85]]],
  ['papel-higienico-4', 'Papel higiénico 4 rollos 30 m', 'Limpieza', '4 u', 4, 'u', 2200, [['Elite', 1.1], ['Higienol', 1.0], ['Felpita', 0.9], ['Campanita', 0.85]]],
  ['rollo-cocina-3', 'Rollo de cocina x3', 'Limpieza', '3 u', 3, 'u', 2100, [['Sussex', 1.1], ['Elite', 1.05], ['Campanita', 0.85]]],
  ['shampoo-400', 'Shampoo', 'Perfumería', '400 ml', 0.4, 'l', 3800, [['Head & Shoulders', 1.25], ['Pantene', 1.2], ['Sedal', 1.0], ['Plusbelle', 0.8]]],
  ['jabon-tocador-3', 'Jabón de tocador x3', 'Perfumería', '3 u', 3, 'u', 2400, [['Dove', 1.3], ['Rexona', 1.0], ['Lux', 0.95], ['Plusbelle', 0.75]]],
  ['pasta-dental-90', 'Pasta dental', 'Perfumería', '90 g', 0.09, 'kg', 2000, [['Colgate', 1.1], ['Kolynos', 0.95], ['Odol', 0.9]]],
  ['huevos-12', 'Huevos blancos x12', 'Frescos', '12 u', 12, 'u', 3600, [['Sin marca', 1.0]]],
  ['papa-kg', 'Papa', 'Frescos', '1 kg', 1, 'kg', 1100, [['Sin marca', 1.0]]],
  ['cebolla-kg', 'Cebolla', 'Frescos', '1 kg', 1, 'kg', 1300, [['Sin marca', 1.0]]],
  ['tomate-kg', 'Tomate redondo', 'Frescos', '1 kg', 1, 'kg', 2800, [['Sin marca', 1.0]]],
  ['banana-kg', 'Banana', 'Frescos', '1 kg', 1, 'kg', 2400, [['Sin marca', 1.0]]],
  ['manzana-kg', 'Manzana roja', 'Frescos', '1 kg', 1, 'kg', 2900, [['Sin marca', 1.0]]],
  ['carne-picada-kg', 'Carne picada común', 'Frescos', '1 kg', 1, 'kg', 7500, [['Sin marca', 1.0]]],
  ['pollo-kg', 'Pollo entero', 'Frescos', '1 kg', 1, 'kg', 4200, [['Sin marca', 1.0]]],
  // ---- Ampliación del catálogo (versión 2): productos básicos de la canasta ----
  ['sal-fina-500', 'Sal fina', 'Almacén', '500 g', 0.5, 'kg', 700, [['Celusal', 1.1], ['Dos Anclas', 1.05], ['Marolio', 0.8]]],
  ['sal-gruesa-1kg', 'Sal gruesa', 'Almacén', '1 kg', 1, 'kg', 900, [['Celusal', 1.1], ['Dos Anclas', 1.05], ['Marolio', 0.8]]],
  ['vinagre-alcohol-1l', 'Vinagre de alcohol', 'Almacén', '1 L', 1, 'l', 900, [['Menoyo', 1.1], ['Dos Anclas', 1.05], ['Marolio', 0.8]]],
  ['aceite-oliva-500', 'Aceite de oliva extra virgen', 'Almacén', '500 ml', 0.5, 'l', 9500, [['Nucete', 1.1], ['Lira', 1.05], ['Cocinero', 0.95]]],
  ['arroz-parboil-1kg', 'Arroz parboil', 'Almacén', '1 kg', 1, 'kg', 1900, [['Gallo', 1.15], ['Lucchetti', 1.0], ['Marolio', 0.82]]],
  ['fideos-tirabuzon-500', 'Fideos tirabuzón', 'Almacén', '500 g', 0.5, 'kg', 1300, [['Matarazzo', 1.25], ['Lucchetti', 1.0], ['Don Vicente', 1.15], ['Marolio', 0.75]]],
  ['harina-leudante-1kg', 'Harina leudante', 'Almacén', '1 kg', 1, 'kg', 1300, [['Blancaflor', 1.15], ['Pureza', 1.1], ['Favorita', 0.95]]],
  ['levadura-seca-10', 'Levadura seca', 'Almacén', '10 g', 0.01, 'kg', 600, [['Levex', 1.05], ['Calsa', 1.0]]],
  ['pan-rallado-500', 'Pan rallado', 'Almacén', '500 g', 0.5, 'kg', 1200, [['Preferido', 1.1], ['Mamá Cocina', 1.0], ['Marolio', 0.8]]],
  ['lentejas-400', 'Lentejas secas', 'Almacén', '400 g', 0.4, 'kg', 1500, [['Egran', 1.1], ['Inca', 1.0], ['Marolio', 0.8]]],
  ['arvejas-lata-300', 'Arvejas en lata', 'Almacén', '300 g', 0.3, 'kg', 700, [['Inca', 1.1], ['Noel', 1.0], ['Marolio', 0.78]]],
  ['choclo-lata-300', 'Choclo amarillo en lata', 'Almacén', '300 g', 0.3, 'kg', 1100, [['Inca', 1.1], ['Arcor', 1.0], ['Marolio', 0.8]]],
  ['pure-tomate-520', 'Puré de tomate', 'Almacén', '520 g', 0.52, 'kg', 800, [['La Campagnola', 1.1], ['Arcor', 1.0], ['Marolio', 0.75]]],
  ['caldo-cubos-6', 'Caldo de verdura x6', 'Almacén', '6 u', 6, 'u', 900, [['Knorr', 1.1], ['Maggi', 1.05], ['Wilde', 0.85]]],
  ['cacao-polvo-360', 'Cacao en polvo', 'Almacén', '360 g', 0.36, 'kg', 3200, [['Nesquik', 1.15], ['Toddy', 1.05], ['Marolio', 0.8]]],
  ['leche-polvo-800', 'Leche en polvo entera', 'Lácteos', '800 g', 0.8, 'kg', 11000, [['La Serenísima', 1.12], ['Sancor', 1.05], ['Nido', 1.2]]],
  ['queso-rallado-150', 'Queso rallado', 'Lácteos', '150 g', 0.15, 'kg', 3200, [['La Serenísima', 1.1], ['Sancor', 1.05], ['Milkaut', 0.95]]],
  ['crema-200', 'Crema de leche', 'Lácteos', '200 ml', 0.2, 'l', 2100, [['La Serenísima', 1.12], ['Sancor', 1.03], ['Milkaut', 0.94]]],
  ['yogur-firme-190', 'Yogur firme vainilla', 'Lácteos', '190 g', 0.19, 'kg', 900, [['La Serenísima', 1.1], ['Sancor', 1.02], ['Ilolay', 0.92]]],
  ['margarina-200', 'Margarina', 'Lácteos', '200 g', 0.2, 'kg', 1600, [['Danica', 1.05], ['Delicia', 1.0]]],
  ['galletitas-dulces-300', 'Galletitas dulces vainilla', 'Almacén', '300 g', 0.3, 'kg', 1500, [['Terrabusi', 1.15], ['Bagley', 1.1], ['Marolio', 0.8]]],
  ['cereales-copos-300', 'Copos de maíz', 'Almacén', '300 g', 0.3, 'kg', 3000, [['Kellogg’s', 1.2], ['Granix', 1.0], ['Marolio', 0.8]]],
  ['avena-400', 'Avena tradicional', 'Almacén', '400 g', 0.4, 'kg', 1600, [['Quaker', 1.15], ['Granix', 1.0], ['Marolio', 0.82]]],
  ['dulce-batata-500', 'Dulce de batata', 'Almacén', '500 g', 0.5, 'kg', 2500, [['Arcor', 1.05], ['Dulcor', 0.95], ['Emeth', 1.0]]],
  ['edulcorante-200', 'Edulcorante líquido', 'Almacén', '200 ml', 0.2, 'l', 2300, [['Hileret', 1.05], ['Chuker', 1.1], ['Marolio', 0.8]]],
  ['mate-cocido-25', 'Mate cocido x25', 'Almacén', '25 u', 25, 'u', 900, [['Taragüí', 1.05], ['La Tranquera', 1.0], ['Unión', 0.95]]],
  ['jamon-cocido-kg', 'Jamón cocido', 'Fiambrería', '1 kg', 1, 'kg', 14000, [['Paladini', 1.15], ['Cagnoli', 1.1], ['Calchaquí', 0.92]]],
  ['queso-tybo-kg', 'Queso tybo', 'Fiambrería', '1 kg', 1, 'kg', 11000, [['La Paulina', 1.1], ['Sancor', 1.05], ['Punta del Agua', 0.92]]],
  ['salchichas-6', 'Salchichas x6', 'Fiambrería', '6 u', 6, 'u', 1800, [['Paty', 1.05], ['Vienissima', 1.1], ['Calchaquí', 0.9]]],
  ['hamburguesas-4', 'Hamburguesas congeladas x4', 'Congelados', '4 u', 4, 'u', 4200, [['Paty', 1.1], ['Swift', 1.0], ['Granja del Sol', 0.95]]],
  ['papas-congeladas-1kg', 'Papas prefritas congeladas', 'Congelados', '1 kg', 1, 'kg', 4500, [['McCain', 1.15], ['Granja del Sol', 1.0], ['Frizzata', 0.92]]],
  ['jugo-1l', 'Jugo de naranja listo', 'Bebidas', '1 L', 1, 'l', 1800, [['Cepita', 1.1], ['Baggio', 1.0], ['Ades', 1.05]]],
  ['agua-saborizada-15', 'Agua saborizada pomelo', 'Bebidas', '1,5 L', 1.5, 'l', 1700, [['Levité', 1.1], ['Aquarius', 1.15], ['Villa del Sur', 1.0]]],
  ['soda-2l', 'Soda en botella', 'Bebidas', '2 L', 2, 'l', 900, [['Ivess', 1.05], ['Villa del Sur', 1.1], ['Marolio', 0.8]]],
  ['vino-tinto-750', 'Vino tinto Malbec', 'Bebidas', '750 ml', 0.75, 'l', 4500, [['Alma Mora', 1.0], ['Santa Julia', 1.1], ['Toro', 0.7]]],
  ['cerveza-litro', 'Cerveza rubia retornable', 'Bebidas', '1 L', 1, 'l', 2200, [['Quilmes', 1.0], ['Brahma', 0.95], ['Andes', 1.05]]],
  ['suavizante-900', 'Suavizante para ropa', 'Limpieza', '900 ml', 0.9, 'l', 2600, [['Vivere', 1.1], ['Comfort', 1.12], ['Marolio', 0.8]]],
  ['jabon-liquido-ropa-3l', 'Jabón líquido para ropa', 'Limpieza', '3 L', 3, 'l', 9800, [['Ariel', 1.2], ['Skip', 1.15], ['Ala', 1.0], ['Zorro', 0.85]]],
  ['limpiador-piso-900', 'Limpiador de pisos', 'Limpieza', '900 ml', 0.9, 'l', 1500, [['Procenex', 1.05], ['Poett', 1.1], ['Marolio', 0.8]]],
  ['bolsas-residuos-10', 'Bolsas de residuos x10', 'Limpieza', '10 u', 10, 'u', 1100, [['Rendimax', 1.05], ['Bolsafort', 1.0]]],
  ['esponja-3', 'Esponja de cocina x3', 'Limpieza', '3 u', 3, 'u', 1300, [['Mortimer', 1.05], ['Virulana', 1.1]]],
  ['servilletas-70', 'Servilletas de papel x70', 'Limpieza', '70 u', 70, 'u', 900, [['Elite', 1.1], ['Campanita', 0.9]]],
  ['desodorante-ambiente', 'Desodorante de ambiente', 'Limpieza', '360 ml', 0.36, 'l', 2600, [['Glade', 1.1], ['Poett', 1.0]]],
  ['acondicionador-400', 'Acondicionador', 'Perfumería', '400 ml', 0.4, 'l', 3800, [['Pantene', 1.2], ['Sedal', 1.0], ['Plusbelle', 0.8]]],
  ['desodorante-150', 'Desodorante en aerosol', 'Perfumería', '150 ml', 0.15, 'l', 3300, [['Rexona', 1.0], ['Axe', 1.05], ['Dove', 1.1]]],
  ['cepillo-dental', 'Cepillo dental', 'Perfumería', '1 u', 1, 'u', 1500, [['Colgate', 1.1], ['Oral-B', 1.2], ['Kolynos', 0.9]]],
  ['toallitas-femeninas-8', 'Toallitas femeninas x8', 'Perfumería', '8 u', 8, 'u', 1700, [['Always', 1.1], ['Kotex', 1.05], ['Lina', 0.9]]],
  ['panales-g-30', 'Pañales talle G x30', 'Bebés', '30 u', 30, 'u', 18000, [['Pampers', 1.15], ['Huggies', 1.12], ['Babysec', 0.9]]],
  ['alimento-perro-3kg', 'Alimento para perro adulto', 'Mascotas', '3 kg', 3, 'kg', 9500, [['Dog Chow', 1.1], ['Pedigree', 1.05], ['Sieger', 1.25]]],
  ['alimento-gato-1kg', 'Alimento para gato adulto', 'Mascotas', '1 kg', 1, 'kg', 5200, [['Cat Chow', 1.1], ['Whiskas', 1.05], ['Excellent', 1.2]]],
  ['lechuga-kg', 'Lechuga criolla', 'Frescos', '1 kg', 1, 'kg', 2600, [['Sin marca', 1.0]]],
  ['zanahoria-kg', 'Zanahoria', 'Frescos', '1 kg', 1, 'kg', 1200, [['Sin marca', 1.0]]],
  ['zapallo-kg', 'Zapallo anco', 'Frescos', '1 kg', 1, 'kg', 1100, [['Sin marca', 1.0]]],
  ['limon-kg', 'Limón', 'Frescos', '1 kg', 1, 'kg', 2200, [['Sin marca', 1.0]]],
  ['naranja-kg', 'Naranja de jugo', 'Frescos', '1 kg', 1, 'kg', 1600, [['Sin marca', 1.0]]],
  ['nalga-kg', 'Nalga', 'Frescos', '1 kg', 1, 'kg', 15500, [['Sin marca', 1.0]]],
  ['asado-kg', 'Asado de tira', 'Frescos', '1 kg', 1, 'kg', 11500, [['Sin marca', 1.0]]],
  ['pan-frances-kg', 'Pan francés', 'Frescos', '1 kg', 1, 'kg', 3200, [['Sin marca', 1.0]]],
];

function eanCheck(d12) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1);
  return String((10 - (s % 10)) % 10);
}

export function buildProducts() {
  const out = [];
  let n = 1;
  for (const [key, name, category, presentation, qty, unit, base, brands] of G) {
    for (const [brand, mult] of brands) {
      const d12 = '20' + String(n++).padStart(10, '0');
      out.push({
        id: d12 + eanCheck(d12),
        generic: key,
        genericName: name,
        name: brand === 'Sin marca' ? `${name} ${presentation}` : `${name} ${brand} ${presentation}`,
        brand,
        category,
        presentation,
        qty,
        unit,
        basePrice: Math.round(base * mult),
        brandMult: mult,
      });
    }
  }
  return out;
}

export const BARRIOS = [
  ['Palermo', -34.5889, -58.43],
  ['Belgrano', -34.5627, -58.4583],
  ['Caballito', -34.6187, -58.44],
  ['Almagro', -34.6097, -58.421],
  ['Villa Crespo', -34.599, -58.438],
  ['Recoleta', -34.5875, -58.3974],
  ['Flores', -34.6286, -58.463],
  ['Villa Urquiza', -34.573, -58.487],
  ['Núñez', -34.544, -58.463],
  ['Boedo', -34.63, -58.417],
  ['San Telmo', -34.6215, -58.373],
  ['Colegiales', -34.574, -58.45],
  ['Balvanera', -34.609, -58.4],
  ['Villa del Parque', -34.605, -58.49],
  ['Saavedra', -34.554, -58.487],
];

// Ampliación (versión 2): más barrios de CABA y localidades del conurbano bonaerense
export const ZONES_EXTRA = [
  ['Villa Devoto', -34.6007, -58.5136, 'CABA'], ['Villa Pueyrredón', -34.58, -58.505, 'CABA'], ['Villa Luro', -34.638, -58.503, 'CABA'],
  ['Liniers', -34.6425, -58.5199, 'CABA'], ['Mataderos', -34.6591, -58.5023, 'CABA'], ['Parque Patricios', -34.638, -58.402, 'CABA'],
  ['Barracas', -34.6448, -58.3809, 'CABA'], ['La Boca', -34.6345, -58.3631, 'CABA'], ['Monserrat', -34.613, -58.381, 'CABA'],
  ['Retiro', -34.5915, -58.3747, 'CABA'], ['Chacarita', -34.587, -58.454, 'CABA'], ['Villa Ortúzar', -34.58, -58.468, 'CABA'],
  ['Agronomía', -34.594, -58.492, 'CABA'], ['Parque Chacabuco', -34.636, -58.438, 'CABA'], ['Villa Lugano', -34.676, -58.474, 'CABA'],
  ['Floresta', -34.629, -58.484, 'CABA'], ['Vélez Sarsfield', -34.633, -58.493, 'CABA'], ['Villa Santa Rita', -34.615, -58.481, 'CABA'],
  ['Coghlan', -34.56, -58.473, 'CABA'], ['Villa Crespo Norte', -34.594, -58.445, 'CABA'],
  ['Caseros', -34.6056, -58.5631, 'Tres de Febrero'], ['Ciudad Jardín Lomas del Palomar', -34.6, -58.595, 'Tres de Febrero'],
  ['Santos Lugares', -34.6006, -58.542, 'Tres de Febrero'], ['Villa Bosch', -34.588, -58.577, 'Tres de Febrero'],
  ['Martín Coronado', -34.5917, -58.5857, 'Tres de Febrero'], ['El Palomar', -34.6158, -58.5958, 'Morón'],
  ['Ciudadela', -34.638, -58.539, 'Tres de Febrero'], ['Villa Lynch', -34.593, -58.53, 'San Martín'],
  ['San Martín', -34.5747, -58.5386, 'San Martín'], ['Villa Ballester', -34.548, -58.555, 'San Martín'], ['San Andrés', -34.56, -58.54, 'San Martín'],
  ['Ramos Mejía', -34.6408, -58.5653, 'La Matanza'], ['San Justo', -34.6833, -58.56, 'La Matanza'], ['Lomas del Mirador', -34.665, -58.531, 'La Matanza'],
  ['Villa Luzuriaga', -34.67, -58.585, 'La Matanza'], ['Haedo', -34.6447, -58.5939, 'Morón'], ['Morón', -34.6534, -58.6198, 'Morón'],
  ['Castelar', -34.6522, -58.6436, 'Morón'], ['Ituzaingó', -34.6584, -58.667, 'Ituzaingó'], ['Hurlingham', -34.5886, -58.6394, 'Hurlingham'],
  ['Vicente López', -34.5263, -58.4745, 'Vicente López'], ['Olivos', -34.5076, -58.4893, 'Vicente López'], ['Florida', -34.5302, -58.489, 'Vicente López'],
  ['Munro', -34.5258, -58.5208, 'Vicente López'], ['San Isidro', -34.4708, -58.5286, 'San Isidro'], ['Martínez', -34.4925, -58.505, 'San Isidro'],
  ['Boulogne', -34.495, -58.565, 'San Isidro'], ['San Fernando', -34.4419, -58.5596, 'San Fernando'], ['Tigre', -34.426, -58.5797, 'Tigre'],
  ['Avellaneda', -34.6623, -58.3653, 'Avellaneda'], ['Wilde', -34.703, -58.32, 'Avellaneda'], ['Lanús', -34.7061, -58.3928, 'Lanús'],
  ['Banfield', -34.744, -58.397, 'Lomas de Zamora'], ['Lomas de Zamora', -34.7609, -58.4063, 'Lomas de Zamora'], ['Temperley', -34.775, -58.397, 'Lomas de Zamora'],
  ['Adrogué', -34.8, -58.39, 'Almirante Brown'], ['Quilmes', -34.7206, -58.2546, 'Quilmes'], ['Bernal', -34.71, -58.28, 'Quilmes'],
  ['Berazategui', -34.764, -58.212, 'Berazategui'], ['Monte Grande', -34.819, -58.468, 'Esteban Echeverría'], ['Ezeiza', -34.853, -58.523, 'Ezeiza'],
  ['San Miguel', -34.543, -58.712, 'San Miguel'], ['José C. Paz', -34.515, -58.768, 'José C. Paz'], ['Merlo', -34.665, -58.727, 'Merlo'],
  ['Moreno', -34.65, -58.79, 'Moreno'], ['Pilar', -34.458, -58.914, 'Pilar'], ['Escobar', -34.348, -58.795, 'Escobar'], ['La Plata', -34.9214, -57.9545, 'La Plata'],
];

const STREETS = ['Av. Corrientes', 'Av. Rivadavia', 'Av. Santa Fe', 'Av. Cabildo', 'Av. Córdoba', 'Av. Scalabrini Ortiz', 'Av. Triunvirato', 'Av. San Juan', 'Av. Directorio', 'Av. Díaz Vélez', 'Av. Juan B. Justo', 'Av. Nazca', 'Av. Independencia', 'Av. Belgrano', 'Av. Las Heras', 'Av. del Libertador'];

function makeStore(r, chain, lat, lng, barrio, idx, prefix) {
  return {
    id: `${prefix}${chain.id}-${idx}`,
    chainId: chain.id,
    name: `${chain.name} ${barrio}${chain.id === 'barrio' ? '' : ''}`,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    address: `${STREETS[Math.floor(r() * STREETS.length)]} ${100 + Math.floor(r() * 4900)}`,
    barrio,
    noise: 0.95 + r() * 0.1,
    demo: true,
  };
}

export function buildStores() {
  const r = rng('ms-stores-v1');
  const stores = [];
  let idx = 1;
  for (const [barrio, lat, lng] of BARRIOS) {
    const count = 2 + Math.floor(r() * 2);
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let chain;
      do chain = CHAINS[Math.floor(r() * CHAINS.length)];
      while (used.has(chain.id));
      used.add(chain.id);
      const dLat = (r() - 0.5) * 0.012;
      const dLng = (r() - 0.5) * 0.014;
      stores.push(makeStore(r, chain, lat + dLat, lng + dLng, barrio, idx++, 'ar-'));
    }
  }
  return [...stores, ...buildStoresExtra()];
}

/** Sucursales de la ampliación (versión 2). Semilla propia para no alterar las anteriores. */
export function buildStoresExtra() {
  const r = rng('ms-stores-v2');
  const out = [];
  let idx = 1;
  for (const [barrio, lat, lng] of ZONES_EXTRA) {
    const count = 2 + (r() < 0.35 ? 1 : 0);
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let chain;
      do chain = CHAINS[Math.floor(r() * CHAINS.length)];
      while (used.has(chain.id));
      used.add(chain.id);
      out.push(makeStore(r, chain, lat + (r() - 0.5) * 0.012, lng + (r() - 0.5) * 0.014, barrio, idx++, 'ar2-'));
    }
  }
  return out;
}

/** Sucursales demo alrededor de un punto (para probar la app fuera de CABA). */
export function buildStoresAround(lat, lng, seed = 'near') {
  const r = rng(`ms-near-${seed}-${lat.toFixed(3)}-${lng.toFixed(3)}`);
  const stores = [];
  for (let i = 0; i < 14; i++) {
    const chain = CHAINS[i % CHAINS.length];
    const ang = r() * Math.PI * 2;
    const distKm = 0.3 + r() * 3.2;
    const dLat = (distKm / 111.32) * Math.cos(ang);
    const dLng = (distKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(ang);
    stores.push(makeStore(r, chain, lat + dLat, lng + dLng, 'cercana', i + 1, `near-${seed}-`));
  }
  return stores;
}

export function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Precios vigentes + histórico mensual (12 meses) para un conjunto de sucursales. */
/** Precios vigentes + serie mensual compacta (12 meses) por sucursal y producto. */
export function buildPrices(products, stores, chainsById, today = new Date()) {
  const current = [];
  const series = [];
  const brandDrift = {};
  for (const p of products) {
    const r = rng(`drift-${p.brand}-${p.category}`);
    brandDrift[p.id] = 0.021 + (r() - 0.45) * 0.018; // inflación mensual simulada por marca
  }
  const dates = [];
  for (let m = 12; m >= 1; m--) dates.push(dayKey(new Date(today.getFullYear(), today.getMonth() - m, 15)));
  const todayKey = dayKey(today);
  for (const s of stores) {
    const chain = chainsById[s.chainId] || { id: 'x', factor: 1 };
    for (const p of products) {
      const r = rng(`price-${s.id}-${p.id}`);
      // ~7 % de faltantes estructurales por sucursal (frescos más faltantes en Día)
      const missProb = (p.category === 'Frescos' || p.category === 'Fiambrería') && chain.id === 'dia' ? 0.3 : 0.07;
      if (r() < missProb) continue;
      const noise = 0.92 + r() * 0.16;
      const price = Math.max(50, Math.round((p.basePrice * chain.factor * (s.noise || 1) * noise) / 10) * 10);
      current.push({ key: `${s.id}|${p.id}`, storeId: s.id, productId: p.id, price, date: todayKey, source: 'demo', verified: false });
      let back = price;
      const prices = [];
      for (let i = 0; i < dates.length; i++) {
        back = back / (1 + brandDrift[p.id] + (r() - 0.5) * 0.012);
        prices.unshift(Math.round(back / 10) * 10);
      }
      series.push({ key: `${s.id}|${p.id}`, storeId: s.id, productId: p.id, dates, prices });
    }
  }
  return { current, series };
}

const ISSUERS = {
  'Mercado Pago': 'billetera',
  MODO: 'billetera',
  'Cuenta DNI': 'billetera',
  'Naranja X': 'billetera',
  Ualá: 'billetera',
  'Banco Nación': 'banco',
  'Banco Galicia': 'banco',
  'Banco Santander': 'banco',
  'BBVA': 'banco',
  'Banco Provincia': 'banco',
  'Banco Macro': 'banco',
  'Tarjeta Visa': 'tarjeta',
  'Tarjeta Mastercard': 'tarjeta',
  'American Express': 'tarjeta',
  'Club La Nación': 'programa',
  'Clarín 365': 'programa',
  Efectivo: 'efectivo',
};
export const PAYMENT_ISSUERS = ISSUERS;

/** Promociones demo por cadena. Días: 0=domingo … 6=sábado. */
export function buildPromos(products, weekSeed = 'w0') {
  const P = [];
  const add = (o) => P.push({ id: `${o.chainId}-${P.length + 1}`, demo: true, ...o });
  add({ chainId: 'carrefour', type: 'second', pct: 70, category: 'Lácteos', days: null, label: '2da unidad al 70 % en lácteos' });
  add({ chainId: 'carrefour', type: 'payment', issuer: 'Banco Nación', pct: 25, days: [3], cap: 10000, label: 'Miércoles 25 % Banco Nación (tope $10.000)' });
  add({ chainId: 'carrefour', type: 'payment', issuer: 'Mercado Pago', pct: 10, days: [2], cap: 4000, label: 'Martes 10 % Mercado Pago (tope $4.000)' });
  add({ chainId: 'coto', type: 'nxm', n: 3, m: 2, category: 'Bebidas', days: null, label: '3x2 en bebidas' });
  add({ chainId: 'coto', type: 'payment', issuer: 'Cuenta DNI', pct: 20, days: [4], cap: 6000, label: 'Jueves 20 % Cuenta DNI (tope $6.000)' });
  add({ chainId: 'coto', type: 'payment', issuer: 'Banco Galicia', pct: 15, days: [1], cap: 5000, label: 'Lunes 15 % Galicia (tope $5.000)' });
  add({ chainId: 'dia', type: 'payment', issuer: 'Mercado Pago', pct: 15, days: [2], cap: 5000, label: 'Martes 15 % Mercado Pago (tope $5.000)' });
  add({ chainId: 'dia', type: 'nxm', n: 4, m: 3, category: 'Limpieza', days: null, label: '4x3 en limpieza' });
  add({ chainId: 'dia', type: 'pct', pct: 10, category: null, days: [6], label: 'Sábados 10 % en toda la tienda' });
  add({ chainId: 'jumbo', type: 'payment', issuer: 'Banco Galicia', pct: 20, days: [3], cap: 8000, label: 'Miércoles 20 % Galicia (tope $8.000)' });
  add({ chainId: 'jumbo', type: 'second', pct: 80, category: 'Perfumería', days: null, label: '2da unidad al 80 % en perfumería' });
  add({ chainId: 'disco', type: 'payment', issuer: 'Banco Santander', pct: 25, days: [1], cap: 7000, label: 'Lunes 25 % Santander (tope $7.000)' });
  add({ chainId: 'disco', type: 'pct', pct: 15, category: 'Frescos', days: [5], label: 'Viernes 15 % en frescos' });
  add({ chainId: 'vea', type: 'payment', issuer: 'Cuenta DNI', pct: 20, days: [5], cap: 6000, label: 'Viernes 20 % Cuenta DNI (tope $6.000)' });
  add({ chainId: 'vea', type: 'nxm', n: 3, m: 2, generic: 'fideos-spaghetti-500', days: null, label: '3x2 en fideos spaghetti' });
  add({ chainId: 'changomas', type: 'payment', issuer: 'MODO', pct: 25, days: [4], cap: 8000, label: 'Jueves 25 % MODO (tope $8.000)' });
  add({ chainId: 'changomas', type: 'second', pct: 50, category: 'Bebidas', days: null, label: '2da unidad al 50 % en bebidas' });
  add({ chainId: 'barrio', type: 'payment', issuer: 'Efectivo', pct: 5, days: [0], cap: null, label: 'Domingos 5 % pagando en efectivo' });
  // ofertas puntuales que rotan con cada sincronización
  const r = rng(`promo-rotation-${weekSeed}`);
  for (const c of CHAINS) {
    for (let i = 0; i < 5; i++) {
      const p = products[Math.floor(r() * products.length)];
      const pct = 10 + Math.floor(r() * 5) * 5;
      add({ chainId: c.id, type: 'pct', pct, productId: p.id, days: null, rotating: true, label: `${pct} % en ${p.name}` });
    }
  }
  return P;
}
