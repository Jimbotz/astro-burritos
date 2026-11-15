# Lentes de impacto · `GET|POST /api/impact`

Corte: 2026-11-15. Implementa `IMPLEMENTACION_LENTES_IMPACTO` v1.0. Hay dos lentes:
- **Gestión municipal del agua** (`lens=water`).
- **Exposición climática al calor** (`lens=heat`).

Cada lente responde a la pregunta:

> ¿Existe evidencia suficiente para priorizar vigilancia, investigación o preparación ante una señal ambiental?

Sus salidas son **señales de planificación**, no órdenes. Nada se calcula con un modelo de lenguaje y ninguna fuente pide cuenta, clave ni token.

Métodos científicos: [`docs/science/water-risk-methodology.md`](../science/water-risk-methodology.md) y [`docs/science/heat-exposure-methodology.md`](../science/heat-exposure-methodology.md). Fuentes y procedencia: [`data-sources-no-auth.md`](data-sources-no-auth.md).

## 1. Peticiones

```text
GET  /api/impact?lens=water&country=MEX&state=Puebla&startYear=2001&endYear=2024
GET  /api/impact?lens=water&municipalityCode=21114&startYear=2001&endYear=2024
GET  /api/impact?lens=heat&country=MEX&state=Puebla&latitude=19.04&longitude=-98.2
POST /api/impact   { "lens": "water", "country": "MEX", "state": "Puebla", "startYear": 2001, "endYear": 2024, "mode": "common-complete-window" }
```

| Parámetro | Valores | Notas |
|---|---|---|
| `lens` | `water`, `heat` | Obligatorio |
| `latitude`, `longitude` | grados | Punto de análisis (la interfaz manda el del paso 1) |
| `municipalityCode` | 5 dígitos INEGI (`21114`) | Punto de referencia = la cabecera municipal (la localidad más poblada) |
| `country`, `state` | `MEX` + nombre de Natural Earth | Sin punto, la referencia es la cabecera del municipio más poblado del estado |
| `startYear`, `endYear` | 1981 – último año completo | Por omisión 2001–2024; el año en curso nunca entra |
| `mode` | `common-complete-window` (por omisión), `fixed-window`, `source-native` | Ver §3 |

Hace falta un lugar: punto, municipio o `country=MEX` con un estado. Si falta, responde 400.

**Celda de referencia.** El análisis de decisión se hace en la celda MERRA-2 (0.5° × 0.625°) del punto de referencia. Sus datos diarios de POWER se piden en vivo desde 1991, en dos peticiones de unos 1.2 MB cada una, así cada una cabe en la caché de datos de Next (límite de 2 MB).

**Mapas.** Para los estados de estudio (Puebla, Tlaxcala, Oaxaca) también se devuelven:
- capas por celda, calculadas desde el snapshot preprocesado;
- capas por municipio, con los límites de INEGI.

## 2. Respuesta

Comunes a los dos lentes:

| Campo | Contenido |
|---|---|
| `schemaVersion`, `generatedAt`, `lens`, `question` | Versión `1.0`, hora, lente y pregunta científica `{es, en}` |
| `request`, `scope` | Petición normalizada. `scope.kind` = `point`, `municipality` o `state`; `scope.reference` = celda, coordenadas y qué representa |
| `period` | `requested`, `effective` (o `null`), `mode`, `blocked` y la cobertura de cada serie (`sources[]`) |
| `decisionSupport` | Ver abajo |
| `indicators[]` | Contrato de §13: `value`, `unit`, `period`, `source`, `method`, `trend`, `quality`, `recent`, `series`, `interpretation` y `limitations` |
| `map` | `available`, `reason`, `layers[]` (leyendas con colores), `cells[]`, `municipalities[]`, `municipalGeometryUrl` y `snapshot` |
| `sources[]` | Manifiestos con producto, URL, fecha, cobertura, resolución, `authRequired: false`, transformaciones y limitaciones |
| `quality.reference` | Validación de los registros diarios de POWER de la celda: total, válidos, faltantes y marcados por tipo |
| `warnings[]`, `limitations[]`, `finalStatement` | Avisos de este resultado, límites del lente y la frase de §17 adaptada |

`decisionSupport` contiene:
- `status`, `label`, `severity`, `summary` y `recommendedAction`.
- `notACommand: true`; en el lente de calor, además `notMedicalAdvice: true`.
- `components` (booleanos o `null`) y `componentDetails[]`, con el detalle de cada componente.
- `sensitivity` (solo agua) y `cannotConclude[]`, lo que el sistema no puede concluir.

**Solo agua:**
- `municipalities[]`: población y resumen de sequía de cada municipio.
- `cells[]`: copia de `map.cells`.
- `validation.station`: estación del SMN más cercana, con su correlación con POWER y la evidencia de años secos.

**Solo calor:**
- `hazard`: estado y variables.
- `exposure`: población 2020, fracción urbana, escala y fuente.
- `priority`: `high-exposure-signal`, `signal-lower-exposure`, `exposure-without-signal`, `no-priority` o `exposure-unknown`.
- `municipalities[]` y `cells[]`.

### Estados

| `status` | Etiqueta | Significado | `severity` (color) |
|---|---|---|---|
| `insufficient-data` | Sin datos suficientes | Falta cobertura: no se emite señal | `neutral` (gris) |
| `no-detectable` | Sin señal detectable | Ningún componente supera su umbral en la ventana. No significa "sin cambio" | `info` (azul) |
| `watch` | Vigilar | Agua: un componente activo. Calor: carga reciente alta sin tendencia robusta | `warning` (ámbar) |
| `planning-signal` | Señal de planificación | Agua: dos o más componentes persistentes. Calor: TX90p o TN90p cumple los cuatro criterios | `warning` (ámbar) |
| `corroborated` | Señal corroborada | Agua: planificación + evidencia observada (la "prioridad" de §7.9). Calor: planificación + el extremo anual lo confirma | Agua: `alert` (rojo). Calor: `alert` solo con alta exposición |

La interfaz nunca deduce el color: lo toma de `severity`. Junto al color siempre hay texto, ícono y descripción.

### Capas del mapa

**Agua.** Todas por celda, salvo la sequía histórica:
- `precipitation-stress`
- `atmospheric-demand`
- `root-zone-wetness`
- `historical-drought` (por municipio)
- `water-priority`

**Calor.** Todas por celda:
- Peligro: `warm-days`, `warm-nights`, `hot-extremes`.
- Exposición: `population-exposure`, `urban-exposure`.
- Prioridad combinada: `priority-zones`.

Cada celda y cada municipio trae `class`; el color sale solo de `layers[].classes`. Cada capa trae además `about.shows` (qué representa) y `about.useFor` (para qué sirve), en español e inglés; la interfaz muestra los de la capa elegida bajo los botones. Para un estado sin snapshot, `map.available` es `false` y `reason` lo explica.

## 3. Ventanas (§6)

- **`common-complete-window`:** el tramo continuo más largo en que todas las series de clasificación están completas, dentro de lo pedido. Agua: lluvia, ET0 y GWETROOT. Calor: TX90p, TN90p, TXx y TNn.
- **`fixed-window`:** exactamente los años pedidos. Si falta uno, `blocked: true`, `effective: null`, el estado pasa a `insufficient-data` y las tendencias salen con `status: 'blocked'`. Nunca se recorta en silencio.
- **`source-native`:** cada serie conserva sus años. Sirve para disponibilidad, no para comparar tendencias entre fuentes.

**Completitud:**
- Año mensual completo = 12 de 12 meses.
- Mes con datos diarios completo = al menos 90% de días válidos; su total es la media de los días válidos por los días del mes, y se avisa.
- TX90p/TN90p exigen todos los días del año. Es más estricto que el 90%, igual que el resto de EarthScope.

## 4. Errores y límites

| HTTP | Cuándo |
|---|---|
| 400 | Lente, código municipal, coordenadas, años o modo inválidos, o falta el lugar |
| 404 | Código municipal que INEGI no tiene |
| 422 | Municipio sin localidades con coordenadas |
| 429 | Más de 10 análisis sin caché por minuto desde la misma IP (`Retry-After`) |
| 499 | El cliente canceló la petición |
| 502 / 504 | NASA POWER rechazó, no respondió o tardó demasiado |

Todas las respuestas de error tienen la forma `{ "error": "…" }`.

**Tiempos medidos en vivo** (2026-11-15): entre 2.4 y 6 s sin caché, según el lugar. Con caché de la CDN, al instante (`s-maxage=86400`). El `POST` no se cachea.

## 5. Resultados medidos (2001–2024)

| Lugar | Agua | Calor |
|---|---|---|
| Puebla (punto 19.04, −98.20) | `watch`: sequía observada D1+ en 4 de los últimos 5 años; lluvia, ET0 y humedad sin persistencia. Estación AFRICAM a 13 km, r = 0.51. Sensibilidad alta (con percentil 0.30 pasa a corroborada) | `corroborated`: TN90p +5.5 pp/década (robusta) y TNn +1.10 °C/década. 3.3 millones de personas en la celda, 93% urbanas → `high-exposure-signal` |
| Tehuacán (`municipalityCode=21156`) | `corroborated`: humedad radicular baja en 4 de 5 años y sequía D1+ en 5 de 5. La estación TEHUACAN tiene 2 de sus últimos 5 años bajo su percentil 20 | `corroborated`: TX90p +8.5 pp/década, confirmada por TXx; 327 312 habitantes |
| Oaxaca (estado, cabecera de Oaxaca de Juárez) | `watch`: ET0 sobre el percentil 80 en 3 de 5 años; sensibilidad alta | `planning-signal`: TN90p +7.1 y TX90p +5.5 pp/década; los extremos aún no lo confirman |

Ejemplos completos: [`samples/impact-water-puebla.json`](samples/impact-water-puebla.json) y [`samples/impact-heat-puebla.json`](samples/impact-heat-puebla.json).

## 6. Interfaz

Después de *Analyze region*, la sección **Impact lenses** muestra dos tarjetas seleccionables: **Water Signal**, con una gota y ondas, y **Heat Signal**, con un termómetro, un sol y un punto de población. Al elegir una:
1. Se pide `/api/impact` con el punto, el país, el estado y el periodo del paso 1.
2. Se muestran:
   - el estado (texto, ícono, color y descripción);
   - el resumen, los componentes y la acción sugerida ("A planning signal, not a command");
   - la fuente y la limitación;
   - en calor, peligro, exposición y prioridad separados; en agua, la validación con la estación;
   - las tarjetas de indicadores: valor principal, qué significa y un botón *Why?* con la definición, el método y la serie anual. Cada familia tiene su color: cálidos para días y noches cálidos (azul si bajan), rojo para el día más cálido, azul para la noche más fría y la mínima media, verde para la población expuesta;
   - el mapa temático, con un solo renglón de capas, la explicación de la capa elegida (qué muestra y para qué sirve) y una leyenda que solo lista las clases presentes en el mapa y el punto de análisis;
   - los avisos, la calidad de datos, *Sources & methods* y *What this lens cannot conclude*.

La tabla de municipios sigue en la respuesta de la API (`municipalities[]`), pero la interfaz no la muestra.

Durante la carga solo hay esqueletos, sin números. Componentes: `components/impact-*.tsx`. Presentación: `lib/ui/impact-*.ts`.

## 7. Lo que el sistema no decide

- Cuánta agua hay en presas, acuíferos, ríos o redes; si un municipio tendrá desabasto; cuándo regar o qué sembrar.
- Efectos en la salud, enfermedades o muertes; el calor de una colonia; alertas o pronósticos.
- Las causas de una señal: una tendencia no es atribución.

## 8. Código y pruebas

- **Ruta y servicio:** `app/api/impact/route.ts`, `lib/api/impact-{service,request,types,text,map,profiles}.ts`.
- **Análisis:** `lib/analysis/{et0,water-risk,heat-risk,impact-series,impact-stats,impact-quality}.ts`; los modos de ventana en `common-window.ts`.
- **Datos:** `lib/data/{conagua,inegi,impact-geometry,impact-manifest,bundled}.ts`.
- **Ingesta:** `scripts/impact/{fetch-raw.sh,smn_catalog.py,ingest_public.py,preprocess-power.ts}`.
- **Pruebas:** `tests/analysis/{et0,water-risk,heat-risk,impact-window,impact-quality}.test.ts`, `tests/api/impact-route.test.ts` y `tests/ui/impact-{lens,cards}.test.tsx`. No llaman APIs externas: usan `data/impact/fixtures/` y los datos empaquetados.
