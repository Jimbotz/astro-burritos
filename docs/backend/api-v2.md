# EarthScope API v2 · guía para la interfaz

Corte: 2026-11-14. Rama `Guillermo`. Esta API procesa en el servidor todas las variables seleccionadas en la auditoría v2 (`docs/backend/frontend-data-handoff.md`): la misma limpieza que hoy usan temperatura y lluvia, más reglas propias de cada variable según lo que representa (perfil de procesamiento, sección 1.1). La interfaz solo tiene que **pedir, filtrar y dibujar**. `/api/series` y `/api/climate` siguen funcionando para clientes externos, pero desde el 2026-11-15 están marcados como obsoletos (cabeceras `Deprecation` y `Link: </api/point>; rel="successor-version"`). Ahora exigen 12/12 meses (hallazgo A1), rechazan claves heredadas como `toString` con 400 (A5) y conservan el mensaje de rechazo de POWER (A6).

| Endpoint | Para qué | Uso en la interfaz |
|---|---|---|
| `GET /api/variables` | Catálogo: nombres (es/en), unidades, grupo, clase, disponibilidad, reglas y textos de veredicto | Construir selectores, leyendas y filtros sin escribir nada a mano |
| `GET /api/point` | Todas las variables de una ubicación (celda POWER): series anuales y mensuales, climatología y evaluación de tendencia | Gráficas y panel de evidencia |
| `GET /api/region?country=…&state=…` (o `POST` con polígono, o `GET` con caja) | Cuadrícula de celdas de una variable recortada a un estado o país, con tendencia por celda y serie regional | Mapa y gráfica regional |
| `GET /api/crosscheck` | Lluvia de una celda según dos registros de NASA (MERRA-2 y GPM IMERG, ambos vía POWER): nivel, años húmedos y secos, concordancia de tendencia y razones (sección 7) | Tarjeta “Two NASA rain records” |

Tipos TypeScript listos para importar: `lib/api/v2.ts` (`PointResponse`, `RegionResponse`, `CrosscheckResponse`, `VariablesResponse`) y `lib/variables/catalog.ts` (`VariableDescriptor`, `VARIABLES`). Ejemplos reales de cada respuesta: `docs/backend/samples/`.

## 1. Variables incluidas

| Id | Variable | Grupo | Clase | Unidad | Fuente POWER | Agregación anual | Mapa | Tendencia 2001–2024 Puebla | Tendencia 2001–2024 Tehuacán |
|---|---|---|---|---|---|---|---|---|---|
| `T2M` | Temperatura media del aire (2 m) | temperature | Núcleo | °C | monthly: T2M | `day-weighted-mean` | sí | +0.45 °C/década (robusta) | +0.62 °C/década (robusta) |
| `TX` | Temperatura máxima media diaria | temperature | Núcleo | °C | daily: T2M_MAX | `daily-mean` | no (diaria) | +0.37 °C/década (no detectable) | +0.73 °C/década (robusta) |
| `TN` | Temperatura mínima media diaria | temperature | Núcleo | °C | daily: T2M_MIN | `daily-mean` | no (diaria) | +0.52 °C/década (robusta) | +0.54 °C/década (robusta) |
| `T2M_RANGE` | Rango térmico diurno | temperature | Núcleo | °C | monthly: T2M_RANGE | `day-weighted-mean` | sí | -0.14 °C/década (no detectable) | +0.19 °C/década (no detectable) |
| `TXx` | Día más caluroso del año | temperature | Extremo térmico | °C | monthly: T2M_MAX | `annual-max` | sí | +0.05 °C/década (no detectable) | +0.44 °C/década (débil) |
| `TNn` | Noche más fría del año | temperature | Extremo térmico | °C | monthly: T2M_MIN | `annual-min` | sí | +1.10 °C/década (robusta) | +0.30 °C/década (no detectable) |
| `TX90p` | Días cálidos | temperature | Extremo térmico | % de días | daily: T2M_MAX | `percent-days-above-p90` | no (diaria) | +2.0 pp/década (no detectable) | +8.5 pp/década (robusta) |
| `TN90p` | Noches cálidas | temperature | Extremo térmico | % de días | daily: T2M_MIN | `percent-days-above-p90` | no (diaria) | +5.5 pp/década (robusta) | +5.8 pp/década (robusta) |
| `PRECTOTCORR` | Precipitación anual | precipitation | Núcleo | mm | monthly: PRECTOTCORR | `sum` | sí | +7.3 %/década (débil), sin afirmación | -1.1 %/década (no detectable), sin afirmación |
| `PREC_MJJASO` | Lluvia de la temporada de lluvias (may–oct en Puebla) | precipitation | Núcleo | mm | monthly: PRECTOTCORR | `wet-season-sum` | sí | +4.1 %/década (no detectable), sin afirmación | -0.8 %/década (no detectable), sin afirmación |
| `QV2M` | Humedad específica (2 m) | humidity | Apoyo | g/kg | monthly: QV2M | `day-weighted-mean` | sí | +0.30 g/kg/década (débil) | +0.26 g/kg/década (robusta) |
| `RH2M` | Humedad relativa (2 m) | humidity | Apoyo | % | monthly: RH2M | `day-weighted-mean` | sí | +0.4 pp/década (no detectable) | -0.6 pp/década (no detectable) |
| `GWETROOT` | Humedad del suelo (zona radicular) | soil | Apoyo | fracción 0–1 | monthly: GWETROOT | `day-weighted-mean` | sí | +0.011 fracción/década (débil) | -0.005 fracción/década (no detectable) |

Tendencia = `trend.display.slope` en la unidad del perfil, con el veredicto entre paréntesis. Generada desde `samples/point-*.json`.

### 1.1 Perfil de procesamiento por variable

Las reglas no son iguales para todas: cada variable trae un `profile` que el backend aplica automáticamente según lo que representa. La interfaz solo necesita leer `trend.display` (ya en la escala y el método del perfil) y `profile.displayUnit`.

| Id | Escala del cambio | Método principal | Anomalía | Límites del registro nativo | Temporadas | Umbral de relevancia | Bloque mínimo | Por qué |
|---|---|---|---|---|---|---|---|---|
| `T2M` | absoluta (°C/década) | OLS + bootstrap por bloques | absoluta (°C) | -90 a 70 | dry, wet | 0.1 °C/década | 2 años | Variable continua y casi normal: OLS con p corregido por autocorrelación. Por temporada porque el calentamiento no es igual todo el año. |
| `TX` | absoluta (°C/década) | OLS + bootstrap por bloques | absoluta (°C) | -90 a 70 | dry, wet | 0.1 °C/década | 2 años | Media de máximas diarias: continua; OLS con p corregido y sub-series por temporada. |
| `TN` | absoluta (°C/década) | OLS + bootstrap por bloques | absoluta (°C) | -90 a 70 | dry, wet | 0.1 °C/década | 2 años | Media de mínimas diarias: continua; el calentamiento nocturno es mayor en la temporada seca, por eso se separa. |
| `T2M_RANGE` | absoluta (°C/década) | OLS + bootstrap por bloques | absoluta (°C) | 0 a 60 | dry, wet | 0.1 °C/década | 2 años | Diferencia de dos temperaturas: continua y no negativa; la nubosidad de la temporada de lluvias la reduce, por eso se separa. |
| `TXx` | absoluta (°C/década) | Sen + intervalo de Gilbert | absoluta (°C) | -90 a 70 | — | 0.2 °C/década | 2 años | Un extremo por año con distribución de valor extremo: pendiente de Sen, robusta a años atípicos. |
| `TNn` | absoluta (°C/década) | Sen + intervalo de Gilbert | absoluta (°C) | -90 a 70 | — | 0.2 °C/década | 2 años | Un extremo por año: pendiente de Sen, robusta a años atípicos. |
| `TX90p` | puntos porcentuales (pp/década) | Sen + intervalo de Gilbert | absoluta (pp) | -90 a 70 | — | 1 pp/década | 2 años | Porcentaje acotado entre 0 y 100 que proviene de conteos: pendiente de Sen en puntos porcentuales; la referencia es 10% en 1991–2020. |
| `TN90p` | puntos porcentuales (pp/década) | Sen + intervalo de Gilbert | absoluta (pp) | -90 a 70 | — | 1 pp/década | 2 años | Porcentaje acotado entre 0 y 100 que proviene de conteos: pendiente de Sen en puntos porcentuales; la referencia es 10% en 1991–2020. |
| `PRECTOTCORR` | % de la media 1991–2020 (%/década) | Sen + intervalo de Gilbert | % (%) | 0 a 500 | — | 5 %/década | 2 años | Sesgada y no negativa: pendiente de Sen expresada en % de la media 1991–2020, comparable entre el valle seco y la sierra húmeda. |
| `PREC_MJJASO` | % de la media 1991–2020 (%/década) | Sen + intervalo de Gilbert | % (%) | 0 a 500 | — | 5 %/década | 2 años | Igual que la lluvia anual, restringida a mayo–octubre. |
| `QV2M` | absoluta (g/kg/década) | OLS + bootstrap por bloques | absoluta (g/kg) | 0 a 50 | dry, wet | 0.1 g/kg/década | 2 años | Continua y positiva: OLS con p corregido; por temporada porque la humedad cambia mucho entre la temporada seca y la de lluvias. |
| `RH2M` | puntos porcentuales (pp/década) | OLS + bootstrap por bloques | absoluta (pp) | 0 a 100 | — | 1 pp/década | 2 años | Acotada entre 0 y 100 y dependiente de la temperatura: cambio en puntos porcentuales; leer junto a la humedad específica. |
| `GWETROOT` | absoluta (fracción/década) | OLS + bootstrap por bloques | absoluta (fracción) | 0 a 1 | — | 0.01 fracción/década | 5 años | Acotada entre 0 y 1 y con memoria de varios años: p de Hamed–Rao y bootstrap con bloques de al menos 5 años. |

Lo común a todas es la limpieza (sin `YYYY13`, sin relleno −999, sin imputación) y la exigencia de años completos, porque un mes faltante sesga cualquier agregado.

- **Escala del cambio**: absoluta para variables físicas; % de la media 1991–2020 para la lluvia (comparable entre el valle seco y la sierra húmeda); puntos porcentuales para índices y humedad relativa.
- **Método principal**: OLS con intervalo por bootstrap de bloques para variables continuas; Sen con intervalo de Gilbert para series sesgadas, acotadas o de extremos. El p es siempre Hamed–Rao. Los criterios R2, R4 y R5 usan el método principal.
- **Anomalías**: `annual[].anomaly` frente a la media 1991–2020 de la misma serie (`baseline.mean`), en unidades o en %.
- **Límites físicos**: los registros nativos fuera de rango se eliminan antes de agregar y se cuentan en `qa.outOfBoundsRecords` (con los datos de 2026-11-14 no hubo ninguno).
- **Temporadas**: `seasons[]` con la temporada de lluvias y la seca **de cada celda**, para las variables que lo requieren. `seasonDefinition` dice cómo se definieron: la de lluvias son los 6 meses consecutivos más lluviosos de 1991–2020 en esa celda y la seca, los otros 6 (en Puebla: may–oct y nov–abr; en Brasilia: oct–mar y abr–sep). Una temporada que cruza el año se asigna al año en que termina. Si esos 6 meses reúnen menos de 60 % de la lluvia anual, o llueve menos de 100 mm al año, `seasonDefinition` es `null` y no hay sub-series. Forman su propia familia de pruebas múltiples (`seasonalFamily`). `PREC_MJJASO` suma la temporada de lluvias de cada celda (el id conserva MJJASO por compatibilidad).
- **Umbral de relevancia**: si el veredicto es `robust` o `probable` pero `trend.display.exceedsRelevance === false`, mostrar “significativa pero pequeña” (aviso `below-relevance`).
- **Referencia esperada**: `profile.expectedValue` (10% para TX90p y TN90p) se dibuja como línea de referencia.

Variables evaluadas y **excluidas** (con su motivo en `GET /api/variables` → `excluded`): nubosidad y radiación (cambio de producto), viento y presión (reanálisis sin homogeneizar), humedad de suelo superficial (redundante), índices diarios de lluvia (llovizna del reanálisis), lluvia de temporada seca y días con helada o de verano (umbrales dependientes de la altitud).

### Cómo filtrar

Todos los campos de filtro están en cada descriptor (`/api/variables` → `variables[]`) y se repiten en cada resultado:

- `group`: `temperature` · `precipitation` · `humidity` · `soil` (pestañas o secciones).
- `fitness`: `core` (titulares) · `thermal-extreme` · `support` (contexto). Para una vista “principal” usar solo `core`.
- `availability.region`: `true` si la variable puede ir al mapa. `availability.monthlySeries` y `availability.climatology` indican qué gráficas tienen datos.
- `trendPolicy`: `allowed` o `show-without-claim`. Con `show-without-claim` (lluvia) se dibuja la serie pero **nunca** se dice “aumenta/disminuye” ni se colorea como tendencia.
- `trend.verdict`: `robust` · `probable` · `weak` · `not-detectable` · `insufficient-data`. Textos listos en `/api/variables` → `verdicts`.

## 2. `GET /api/point`

```text
GET /api/point?latitude=19.04&longitude=-98.20&startYear=2001&endYear=2024&variables=T2M,TN,TX
```

| Parámetro | Obligatorio | Valor por defecto | Regla |
|---|---|---|---|
| `latitude`, `longitude` | sí | — | ±90 / ±180 |
| `startYear`, `endYear` | no | 2001 y 2024 (ventana común con IMERG) | 1981 ≤ inicio ≤ fin ≤ último año completo; máximo 60 años |
| `variables` | no | todas las de punto | lista separada por comas; ids del catálogo |

Respuesta (`PointResponse`):

```ts
{
  schemaVersion: '2.0', generatedAt,
  request: { latitude, longitude, startYear, endYear, variables },
  support: { type: 'grid-cell', centerLat, centerLon, dLat: 0.5, dLon: 0.625, bounds, elevationM },  // celda, no la ciudad
  window: { startYear, endYear, mode: 'fixed', sensitivity: { startYear, endYear } },
  family: { method: 'benjamini-hochberg', alpha: 0.05, pValue: 'hamed-rao', members, note },
  sources: [ /* URL exacta, versión, fecha de consulta y cobertura de cada llamada a POWER */ ],
  seasonalFamily: { method: 'benjamini-hochberg', alpha: 0.05, members, note },
  variables: [{
    id, label: { es, en }, unit, trendUnit, group, fitness, trendPolicy,
    profile,                                                           // ver 1.1
    baseline: { period: '1991-2020', mean, anomalyKind, anomalyUnit },
    annual: [{ year, value, validCount, expectedCount, complete, anomaly }],   // value null si el año está incompleto
    monthly: [{ date: 'YYYY-MM', value }] | null,                      // lluvia como total mensual
    climatology: [{ month, value, years }] | null,                     // 1991–2020
    trend: RobustTrend,
    seasons: [{ id: 'dry' | 'wet', label, months, annual, trend: RobustTrend }],
    qa: { outOfBoundsRecords },
    warnings: [{ code, es, en }],
  }]
}
```

`RobustTrend` (pendientes **por década**):

| Campo | Qué mostrar |
|---|---|
| `display` | **Lo primero que se muestra**: `{ method, scale, unit, slope, ci95, pValue, referenceMean, relevanceThreshold, exceedsRelevance }`, ya en la escala y el método del perfil. |
| `primary` | Lo mismo en unidades nativas por década (`slopePerDecade`, `ci95PerDecade`); es lo que usan los criterios. |
| `slopePerDecade`, `ci95BlockBootstrapPerDecade` | OLS e intervalo por bloques en unidades nativas (detalle). |
| `senPerDecade`, `ci95SenPerDecade` | Sen y su intervalo en unidades nativas (detalle). |
| `pValueHamedRao` | p principal. `pValueOls` y `pValueMannKendall` son de referencia. |
| `qValue` | p ajustado por pruebas múltiples dentro de la ubicación. |
| `minimumDetectablePerDecade`, `detectabilityRatio` | Para explicar “no se detecta” sin decir “no cambia”. |
| `criteria`, `criteriaMet` | Los cinco criterios R1–R5 (para un panel de detalle). |
| `verdict`, `claimAllowed` | Qué texto y qué icono usar (ver 2.1). |
| `lines.ols`, `lines.sen` | Inicio y fin de cada recta, listos para dibujar sobre la serie anual. |
| `sensitivity` | Pendiente en la ventana alternativa (1981–fin o los últimos 24 años). |
| `excludedIncompleteYears`, `warnings` | Avisos con código y texto en es/en. |

### 2.1 Reglas de presentación

1. El número principal es `trend.display.slope` con `trend.display.ci95` y `trend.display.unit`.
2. Mostrar flecha o texto de aumento/disminución **solo** si `trend.claimAllowed === true` y `trend.verdict` es `robust` o `probable`. Si además `trend.display.exceedsRelevance === false`: “significativa pero pequeña”.
3. Con `weak`: “indicio débil”, sin flecha. Con `not-detectable`: “no se detecta tendencia con estos datos (mínimo detectable: X por década)”.
4. Con `claimAllowed === false` (lluvia): serie, anomalías y climatología, sin color de tendencia ni flecha; mostrar `warnings` con código `not-claimable`.
5. Rotular siempre el soporte: “celda NASA POWER 0.5° × 0.625°, elevación media N m”.
6. Los años con `complete === false` se dibujan como hueco, no como cero.
7. Ubicar los puntos por año y escalar el eje al rango de datos.
8. Para comparar temporadas, usar `seasons[].trend.display` (por ejemplo, la mínima se calienta más en la temporada seca).

## 3. `/api/region` (mapa)

La interfaz pide el área **por id** de Natural Earth: el código ADM0_A3 del país y, para un estado, su nombre exacto. El servidor lee el mismo contorno que dibuja el mapa (`public/geo/`, incluido en el bundle de la función con `outputFileTracingIncludes`). La URL es corta y estable, así que la CDN la guarda 24 h (`Cache-Control: public, s-maxage=86400`) y una segunda persona que pida el mismo estado no llega a la función:

```http
GET /api/region?variable=T2M&country=MEX&state=Puebla&startYear=2001&endYear=2024
GET /api/region?variable=T2M&country=MEX                 # país completo
```

Un país o estado desconocido devuelve 404, y un código que no tiene tres letras mayúsculas devuelve 400. El código se valida antes de construir la ruta del archivo, así que no se puede inyectar una ruta. `request.selection` es `"area"` y `request.area` trae `{ country, state, name }`.

Para cualquier otro polígono (clientes externos), se envía la geometría. Esta respuesta es privada y no se guarda en la CDN:

```http
POST /api/region
Content-Type: application/json

{ "variable": "T2M", "startYear": 2001, "endYear": 2024, "geometry": { "type": "Polygon", "coordinates": [...] }, "format": "json" }
```

Por caja: `GET /api/region?variable=T2M&minLat=17.75&maxLat=20.75&minLon=-99.25&maxLon=-96.75&startYear=2001&endYear=2024`.

`format: "geojson"` devuelve un `FeatureCollection` de cuadrados (una celda por feature) con todos los campos de la celda en `properties` y el resto de la respuesta en `properties` del collection: se puede dibujar directo con `d3.geoPath`.

Respuesta (`RegionResponse`):

```ts
{
  request, variable: { id, label, unit, trendUnit, trendPolicy, fitness, profile },
  grid: { dLat: 0.5, dLon: 0.625, cellCount, tileCount },
  cells: [{ id, lat, lon, bounds: { west, south, east, north }, elevationM, coverage,
            nYears, mean, baseline, slopePerDecade, senPerDecade, slopeDisplay,
            anomalyRecent, recentYears, pValueHamedRao, qValueField, significantField }],
  summary: { cellsWithTrend, positive, negative, significantField, fieldAlpha: 0.1 },
  legend: { mean, slopePerDecade, slopeDisplay, anomalyRecent },   // cada uno { min, max, symmetricMaxAbs }
  regional: { baseline, annual, trend: RobustTrend, warnings },     // serie de todo el estado/país, ponderada por área
  qa: { outOfBoundsRecords },
  sources, notes
}
```

### 3.1 Cómo dibujar el mapa

- Cada celda es un rectángulo `bounds`; dibujarlo sin suavizar ni interpolar. `coverage` (0–1) indica qué parte cae dentro del polígono: se puede usar como opacidad o para recortar con el polígono.
- **Capa “promedio”** (`mean`): color secuencial con `legend.mean`. Mezcla altitudes muy distintas (en Puebla de 165 a 2,630 m), así que sirve como contexto.
- **Capa “anomalía reciente”** (`anomalyRecent`, últimos 5 años completos frente a 1991–2020, en `profile.anomaly.unit`): color divergente centrado en 0 con dominio `±legend.anomalyRecent.symmetricMaxAbs`. Es la capa recomendada para comparar celdas y la única de cambio para la lluvia.
- **Capa “tendencia”** (`slopeDisplay`, en `profile.displayUnit`; solo si `variable.trendPolicy === 'allowed'`): color divergente centrado en 0 con dominio `±legend.slopeDisplay.symmetricMaxAbs` (percentil 95, evita que una celda extrema apague el resto). Borde marcado en las celdas con `significantField === true`.
- Debajo del mapa: “N de M celdas con tendencia significativa” (`summary`), la etiqueta `profile.regionalLabel` y la gráfica de `regional.annual` con `regional.trend.lines`.

### 3.2 Límites y tiempos medidos

- Máximo ~2,500 celdas por región. Más grande → HTTP 413 con mensaje. La interfaz es más estricta: estima las celdas y los bloques de 5° antes de pedir (unos 2.5 s por bloque sin caché), muestra el tiempo transcurrido con un botón para cancelar y no pide áreas de más de 800 celdas (por ejemplo, México completo); en ese caso pide elegir un estado.
- POWER se consulta en bloques alineados de 5° × 5° (1 parámetro por bloque). Medido el 2026-11-14: estado de Puebla (21 celdas, 2 bloques) 2–11 s la primera vez; México completo (665 celdas, 35 bloques, 346 KB de respuesta) 87 s la primera vez y 1.7 s después. Los bloques quedan en caché 24 h. Conviene mostrar un estado de carga y, a escala de país, empezar por la variable por defecto.
- Regiones que cruzan el antimeridiano (por ejemplo Fiyi o Rusia completa) devuelven 422.
- `maxDuration = 120` s en `/api/region` y `/api/point` (configuración del segmento de ruta). La región más grande que acepta la API tardó 87 s sin caché.
- **Cancelación.** El servidor pasa `request.signal` al cliente de POWER. Si el navegador cancela (botón Cancel, nueva consulta o pestaña cerrada), no se piden más bloques y se cancelan los que estaban en vuelo, sin reintento. Los bloques ya descargados quedan en la caché de datos.
- **Límite por cliente** (`lib/api/rate-limit.ts`): 12 análisis de región y 30 de punto por minuto y por IP (`x-forwarded-for`). Al pasarlo, la respuesta es 429 con `Retry-After`. El conteo vive en la memoria de cada instancia, así que en serverless es un freno por instancia y no una defensa distribuida (esa le toca al firewall de la plataforma). Las respuestas servidas desde la CDN no cuentan.

### 3.3 Proyección exploratoria (`projection`, `cells[].fit`)

Solo para las variables con `profile.projection` (T2M, TXx, TNn y PRECTOTCORR); en las demás `projection` es `null`. **No es un pronóstico**: es una extrapolación lineal exploratoria (`interpretation: "exploratory-extrapolation"`), según la sección “Linear regression and future values” de `docs/roadmap/data-strategy.md`.

- Cada celda trae `fit: { intercept, slopePerYear, xMean, sxx, residualSd, n, tCrit, ar1 }`: la recta OLS de sus años completos en la ventana. `predict(fit, año, rule.floor)` de `lib/analysis/projection.ts` devuelve el valor y el intervalo de predicción de 95 % para un año nuevo, ensanchado por √((1 + r1)/(1 − r1)) cuando los residuos están autocorrelacionados.
- Validación sobre la **serie regional ponderada** (`holdout.scope: "regional-series"`), no sobre celda-años: las celdas vecinas comparten el tiempo meteorológico, así que 21 celdas × 5 años no son 105 pruebas independientes. Usa orígenes móviles: cada una de las últimas `rule.holdoutWindows` (2) ventanas de `rule.holdoutYears` (5) años (2015–2019 y 2020–2024) se predice con una recta ajustada a los años anteriores a ella, y los errores se combinan. `holdout.windows` trae la mejora de cada ventana. `holdout` compara la recta con el promedio del entrenamiento: `rmseModel`, `rmseBaseline`, `maeModel`, `maeBaseline`, `skill` = 1 − RMSE(recta)/RMSE(promedio), `bias` (observado − predicho; > 0 = los años recientes quedaron arriba de la recta) y `coverage95`.
- `status`: `ok` · `blocked-by-quality` (la recta predice peor que el promedio en la ventana más reciente, desde la que se extiende, o la mejora combinada es menor que `rule.minSkill`, 10 %: no se dibuja nada) · `insufficient-data` (menos de `minFitYears + holdoutYears` años completos).
- `warnings` (con `status: "ok"`):
  - `interval-undercoverage`: menos de `rule.minCoverage` (80 %) de los años reservados cae en el intervalo.
  - `unstable-skill`: en una ventana anterior la recta predijo peor que el promedio.
  - `curvature`: el término cuadrático de la serie regional tiene p < `rule.diagnosticAlpha` (0.05). Su error estándar se ensancha por AR(1). Si la serie se curva hacia arriba, la recta extendida queda por debajo de los valores reales.
  - `growing-variance`: Breusch–Pagan de Koenker con p < 0.05 y una dispersión que crece con el tiempo, así que el intervalo de ancho constante queda angosto en los años proyectados.
- `diagnostics: { years, curvature: { coefficient, tStatistic, pValue, ar1 }, variance: { lm, pValue, trend } }`. Viene siempre, también cuando la proyección está bloqueada (`lib/analysis/diagnostics.ts`).
- `horizon` es el rango del deslizador: del inicio de la ventana a `fin + rule.horizonYears` (10). Dentro de `fitYears` se muestra la recta ajustada; después, la extrapolación.
- `domain` es fijo para todo el rango del deslizador (mínimo y máximo de las rectas en los extremos), así que un cambio de color siempre es un cambio de valor. Escala secuencial: claro = valor bajo, oscuro = alto.
- La interfaz tiene dos modos (`lib/ui/projection-view.ts`). **Value** es el valor de la recta en el año elegido. **Change since {último año}** es la recta en ese año menos la recta en el último año con datos: divergente, blanco en 0 y con escala fija para todo el deslizador. Se compara contra la recta y no contra el valor observado, para mostrar la tendencia y no el tiempo de un solo año. Las celdas con `significantField === false` llevan un rayado: su dirección no se distingue del ruido entre años. El panel separa cuántas rectas suben y bajan, cuántas de ellas son significativas, la mejora de cada ventana y los p de forma.

Medido el 2026-11-15 (2001–2024, ventanas 2015–2019 y 2020–2024, serie regional): solo T2M pasa. En Puebla mejora 20 % combinado y −4 % en 2015–2019, por eso lleva `unstable-skill`; en Oaxaca mejora 27 %. Los dos llevan `interval-undercoverage`, porque los años recientes quedaron arriba de la recta, y `curvature` (p = 0.0007 y 0.0016), porque la serie se acelera. Oaxaca lleva además `growing-variance` (p = 0.034). La sensibilidad a cada umbral está en `docs/science/threshold-sensitivity.md`. En la ventana 2015–2019 ninguna variable mejora al promedio en 10 %: exigir ambas ventanas por separado bloquearía todo. TXx, TNn y PRECTOTCORR quedan bloqueadas en Puebla, Tlaxcala y Oaxaca (la lluvia de Tlaxcala gana en 2015–2019 pero pierde en 2020–2024).

## 4. Errores

| HTTP | Cuándo | Qué mostrar |
|---|---|---|
| 400 | Parámetros inválidos (año, coordenadas, variable, geometría) | `error` tal cual |
| 413 | Región demasiado grande o geometría > 5 MB | Sugerir un estado o simplificar el polígono |
| 404 | País o estado desconocido en `GET /api/region?country=…&state=…` | `error` tal cual |
| 422 | Región sin celdas o que cruza el antimeridiano | `error` tal cual |
| 429 | Demasiados análisis sin caché desde la misma IP | `error` tal cual; esperar `Retry-After` segundos |
| 499 | El cliente canceló la petición (nadie lee esta respuesta) | — |
| 502 | POWER rechazó o no respondió | “NASA POWER no está disponible”, con reintento |
| 504 | POWER tardó demasiado | Reintento o región menor |

Todas las respuestas de error tienen la forma `{ "error": "..." }`.

## 5. Datos de ejemplo

| Archivo | Petición | Tamaño |
|---|---|---|
| `samples/point-puebla-2001-2024.json` | GET /api/point · celda de Puebla (19.04, −98.20) | 231 KB |
| `samples/point-tehuacan-2001-2024.json` | GET /api/point · celda de Tehuacán (18.46, −97.39) | 227 KB |
| `samples/region-bbox-T2M-2001-2024.json` | GET /api/region · caja 17.75–20.75 N, 96.75–99.25 W · T2M | 19 KB |
| `samples/region-puebla-GWETROOT-2001-2024.json` | POST /api/region · polígono del estado de Puebla · GWETROOT | 18 KB |
| `samples/region-puebla-PRECTOTCORR-2001-2024.json` | POST /api/region · polígono del estado de Puebla · PRECTOTCORR | 19 KB |
| `samples/region-puebla-PREC_MJJASO-2001-2024.json` | POST /api/region · polígono del estado de Puebla · PREC_MJJASO | 18 KB |
| `samples/region-puebla-QV2M-2001-2024.json` | POST /api/region · polígono del estado de Puebla · QV2M | 18 KB |
| `samples/region-puebla-RH2M-2001-2024.json` | POST /api/region · polígono del estado de Puebla · RH2M | 18 KB |
| `samples/region-puebla-T2M-2001-2024.geojson` | POST /api/region · polígono del estado de Puebla · T2M · format geojson | 20 KB |
| `samples/region-puebla-T2M-2001-2024.json` | POST /api/region · polígono del estado de Puebla · T2M | 18 KB |
| `samples/region-puebla-T2M_RANGE-2001-2024.json` | POST /api/region · polígono del estado de Puebla · T2M_RANGE | 18 KB |
| `samples/region-puebla-TNn-2001-2024.json` | POST /api/region · polígono del estado de Puebla · TNn | 18 KB |
| `samples/region-puebla-TXx-2001-2024.json` | POST /api/region · polígono del estado de Puebla · TXx | 18 KB |
| `samples/region-tlaxcala-T2M-2001-2024.json` | POST /api/region · polígono de Tlaxcala (estado pequeño) · T2M | 9 KB |
| `samples/variables.json` | GET /api/variables | 23 KB |

Se generaron llamando a esta misma API con datos reales de NASA POWER (2026-11-14). Sirven para desarrollar la interfaz sin red y para pruebas; en producción se consume la API.

## 6. Procesamiento

1. Limpieza común: se descartan el registro anual `YYYY13`, los valores de relleno −999 y los no numéricos; nada se imputa. Después se eliminan los registros fuera de los límites físicos del perfil.
2. Años completos: 12/12 meses (o todos los días para las variables diarias). La API v1 todavía acepta 11/12 (hallazgo A1).
3. Agregación según `aggregation` (media ponderada por días, suma con días reales, temporada de lluvias de cada celda, máximo/mínimo anual, media diaria o porcentaje de días sobre el percentil 90 de 1991–2020) y, si el perfil lo pide, sub-series por temporada.
4. Línea base 1991–2020 (mínimo 25 años completos) y anomalías en unidades o en %.
5. Tendencia: OLS, Mann–Kendall, Hamed–Rao (p principal), TFPW, Sen con intervalo, bootstrap por bloques (bloque mínimo del perfil), jackknife y ventana de sensibilidad con el método principal del perfil, tendencia mínima detectable, Benjamini–Hochberg y umbral de relevancia.
6. Región: celdas MERRA-2 nativas, fracción dentro del polígono, línea base y anomalía reciente por celda, pendiente en la escala del perfil, FDR de campo (q < 0.10) y serie regional ponderada por fracción × cos(lat).

Código: `lib/variables/catalog.ts`, `lib/analysis/{annual-rules,robust-stats,robust-assessment,region}.ts`, `lib/nasa/power.ts`, `lib/api/*`, `app/api/{variables,point,region}/route.ts`. Pruebas: `tests/analysis/*.test.ts`, `tests/api/validation.test.ts`.

## 7. `GET /api/crosscheck` (lluvia: MERRA-2 contra GPM IMERG)

`GET /api/crosscheck?latitude=19.40&longitude=-98.16&startYear=2001&endYear=2024` compara la lluvia de la celda MERRA-2 del punto con un segundo registro de NASA, GPM IMERG. Los dos vienen de la API pública de POWER y ninguno pide login ni token.

**Peticiones a POWER**
- **MERRA-2:** la misma petición mensual por punto que hace `GET /api/point`, con la URL idéntica, así que comparten caché.
- **IMERG:** el parámetro `IMERG_PRECTOT` en `monthly/regional`, con `time-standard=UTC`. POWER solo sirve IMERG en UTC; en LST devuelve −999.
- **Tamaño de la región:** el endpoint regional exige 2° por eje, así que se pide la caja de 2° × 2° centrada en la celda (400 píxeles de 0.1°).

**Procesamiento**
- **Huella común.** Los píxeles de IMERG se promedian sobre los límites de la celda MERRA-2. Cada uno pesa por su área dentro de la celda × cos(lat), y un mes cuenta solo si todos los píxeles que tocan la celda tienen valor. `footprint` reporta cuántos píxeles entraron y qué fracción de la celda cubren; si cubren menos de 99.9 %, la respuesta es 502.
- **Mismas reglas que todo EarthScope.**
  - Límites físicos de la lluvia y regla de 12/12 meses.
  - Temporada de lluvias propia de la celda MERRA-2, aplicada a los dos registros.
  - Sen con intervalo de Gilbert, p de Hamed–Rao y tendencia mínima detectable, en mm/década.
- **Ventana.** Empieza en 1998 como mínimo, el primer año de IMERG; `window.clippedToImerg` lo indica. Con menos de 10 años responde 400, y en latitudes de más de ±60° responde 422.

**Campos principales**

| Campo | Contenido |
|---|---|
| `comparisons[]` | `annual` y, si la celda tiene temporada clara, `wet`. Cada uno trae `merra2` y `imerg` (serie anual y `trend`), `level`, `trend` y `reasons` |
| `level` | `meanA` (MERRA-2) y `meanB` (IMERG) en los años completos en común, `differencePercent`, `sameLevel` (±10 %), `correlation` (r sin la tendencia de cada registro) y `yearToYear` (`strong` ≥ 0.7, `weak` < 0.4, `moderate`) |
| `trend` | `agreement`: `agree`, `disagree`, `inconclusive` o `insufficient-data`. También trae `reason`, `detected` (p de Hamed–Rao < 0.05 en cada registro) e `intervalsOverlap` |
| `reasons[]` | Códigos que la interfaz convierte en texto (`lib/ui/crosscheck-view.ts`): `different-methods`, `satellite-transition` (la ventana cruza 2014, cambio de TRMM a GPM), `station-skill`, `below-detectable`, `level-gap` y `weak-year-to-year` |
| `rules` | Los umbrales usados (`CONCORDANCE_RULES` en `lib/analysis/concordance.ts`), fijados antes de calcular cualquier resultado |

**Reglas de concordancia**
- **Coinciden (`agree`):** los dos registros detectan tendencia del mismo signo y sus intervalos de 95 % se traslapan.
- **Discrepan (`disagree`):** signos opuestos detectados, o intervalos que no se traslapan.
- **No concluyente (`inconclusive`):** cualquier otro caso.

La respuesta nunca dice que la lluvia sube o baja: la precipitación conserva `trendPolicy: 'show-without-claim'`.

**Resultados medidos (2001–2024, lluvia anual)**

| Celda | MERRA-2 | IMERG | Resultado |
|---|---|---|---|
| Puebla (19.04, −98.20) | +66 mm/década, p = 0.05005 | +22 mm/década, p = 0.50 | `inconclusive` (ninguno detecta); medias 884 y 913 mm, r = 0.68 |
| Tlaxcala (19.40, −98.16) | +185 mm/década [+110, +293], p < 0.001 | −27 mm/década [−87, +35], p = 0.36 | `disagree` (intervalos separados) |
| Tehuacán (18.46, −97.39) | −11 mm/década | −13 mm/década | `inconclusive`; medias 912 y 907 mm, r = 0.74 |

**Tiempo, límite y pruebas**
- **Tiempo medido:** 1–2 s sin caché.
- **Límite por IP:** 20 consultas sin caché por minuto (429 con `Retry-After`). La CDN guarda la respuesta 24 h.
- **Código:** `lib/api/crosscheck-service.ts`, `lib/analysis/{concordance,footprint}.ts`, `lib/nasa/power.ts` (`fetchImergBox`) y `app/api/crosscheck/route.ts`.
- **Pruebas:** `tests/api/crosscheck.test.ts`, `tests/analysis/concordance.test.ts` y `tests/ui/crosscheck-view.test.tsx`. Usan la respuesta real de IMERG guardada en `tests/fixtures/power/`.
