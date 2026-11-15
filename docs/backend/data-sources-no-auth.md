# Fuentes sin autenticación

Ninguna fuente de EarthScope pide cuenta, clave, token ni suscripción. El jurado puede usar el sitio o clonar el repositorio y correrlo sin configurar nada.

**Cómo llega cada fuente:**
- **NASA POWER:** se consulta en vivo.
- **CONAGUA/SMN e INEGI:** se descargaron durante el desarrollo y se empaquetan como subconjuntos procesados. Se conservan la URL, la fecha y el SHA-256 del archivo original.

Los archivos crudos están en `data/impact/raw/` y no se suben a git porque pesan cerca de 600 MB. Se regeneran con los scripts.

## Fuentes en uso

### NASA POWER (en vivo)

- **Producto:** API v2.10. Meteorología de MERRA-2; radiación de CERES SYN1deg (desde 2001) y GEWEX SRB (antes); GPM IMERG para el cruce de lluvia.
- **URL:** https://power.larc.nasa.gov/api/temporal/daily/point
- **Lentes:** núcleo, agua y calor.
- **Acceso:** API pública, sin login.
- **Cobertura y resolución:** 1981–2025, celda de 0.5° × 0.625°.
- **Uso:** 12 parámetros diarios desde 1991, más el snapshot por celda de los 3 estados.
- **Verificado el 2026-11-15:** los 11 parámetros de ET0 existen en la API diaria (comunidad AG), con las unidades esperadas: °C, m/s, kPa y MJ/m²/día.

### CONAGUA / SMN: estaciones (snapshot empaquetado)

- **Producto:** Base de Datos Climatológica Nacional, registro diario por estación.
- **URL:** `https://smn.conagua.gob.mx/tools/RESOURCES/Normales_Climatologicas/Diarios/<edo>/dia<id>.txt`
- **Lente:** agua.
- **Acceso:** archivo público.
- **Cobertura:** 45 estaciones con datos de 1981 a 2025.
- **Descarga:** 2026-11-15; cada estación guarda su SHA-256 en el manifiesto.
- **Catálogo:** el SMN no publica una lista descargable (el KMZ responde HTTP 500). `scripts/impact/smn_catalog.py` lee el encabezado de cada archivo (los primeros 1.5 kB), que trae nombre, municipio, estado, situación y coordenadas. Resultado: 613 estaciones en Puebla (215), Tlaxcala (56) y Oaxaca (342).
- **Selección:** las celdas MERRA-2 se ordenan por población INEGI. En cada una se toma la estación operando más cercana al centro que tenga al menos 15 años completos en 2001–2024. Se descargaron 70 archivos (25 MB) para quedarse con 45.

### CONAGUA / SMN: Monitor de Sequía de México (snapshot empaquetado)

- **Producto:** municipios con sequía, `MunicipiosSequia.xlsx`.
- **URL:** https://smn.conagua.gob.mx/tools/RESOURCES/Monitor%20de%20Sequia%20en%20Mexico/MunicipiosSequia.xlsx
- **Lente:** agua.
- **Acceso:** archivo público.
- **Cobertura:** 2 478 municipios y 438 fechas, de 2003-01-31 a 2026-10-31.
- **Descarga:** 2026-11-15; el SHA-256 está en el manifiesto.

### INEGI: Censo 2020, ITER (snapshot empaquetado)

- **Producto:** principales resultados por localidad.
- **URL:** https://www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/iter/iter_00_cpv2020_csv.zip (36.6 MB).
- **Lente:** calor.
- **Acceso:** archivo público.
- **Cobertura:** 189 432 localidades, todas con coordenadas válidas, y 2 469 municipios.
- **Descarga:** 2026-11-15; el SHA-256 está en el manifiesto.

### INEGI: Marco Geoestadístico 2020 (snapshot empaquetado)

- **Producto:** áreas geoestadísticas municipales de Puebla, Tlaxcala y Oaxaca: 217, 60 y 570 municipios.
- **URL:** https://www.inegi.org.mx/temas/mg/. Paquetes por estado de 152, 53 y 175 MB.
- **Lentes:** agua y calor (mapas).
- **Acceso:** archivo público.
- **Descarga:** 2026-11-15; los SHA-256 están en el manifiesto.

### FAO-56 (método)

- **Producto:** Penman–Monteith de referencia (Allen et al., 1998).
- **URL:** https://www.fao.org/4/X0490E/x0490e0b.htm
- **Lente:** agua.
- **Uso:** método de la ET0. No es una fuente de observaciones.

### Open-Meteo (opcional, no usada)

- **Producto:** Historical Weather API (ERA5 / ERA5-Land).
- **URL:** https://open-meteo.com/en/docs/historical-weather-api
- **Uso:** queda como comparación opcional. La aplicación no la usa y funciona sin ella.

Manifiestos completos, con el esquema de §5.1: `data/impact/manifests/*.json`.

## Proceso por fuente (§5.3)

Cada fuente pasa por estos pasos:
1. Ingesta.
2. Esquema.
3. Coordenadas.
4. Fechas.
5. Duplicados.
6. Valores de relleno.
7. Unidades.
8. Valores imposibles.
9. Cobertura.
10. Normalización.
11. Agregación.
12. Análisis.
13. Entrega.

Los valores anómalos se marcan y se cuentan; nunca se eliminan en silencio ni se convierten en cero.

| Fuente | Dónde | Controles concretos |
|---|---|---|
| NASA POWER | `lib/analysis/impact-quality.ts` (en cada petición), `et0.ts`, `annual-rules.ts` | Registro normalizado por día y variable. Se marcan `fill-value` (−999), fechas, coordenadas, duplicados, `unit` y `out-of-bounds`. Las entradas de ET0 fuera de rango y los días con Tmín > Tmáx se marcan |
| Estaciones SMN | `scripts/impact/ingest_public.py` (`parse_station`) | `NULO` = faltante; fechas inválidas y duplicadas; fuera de rango (lluvia 0–500 mm, Tmáx −40–60, Tmín −50–50); Tmín > Tmáx. Año con al menos 90% de días válidos |
| Monitor de Sequía | `ingest_public.py` (`drought`) | Fechas seriales de Excel a ISO; categorías D0–D4; categorías desconocidas contadas (0); duplicados (0) |
| ITER | `ingest_public.py` (`population`) | Grados-minutos-segundos a decimal; caja de México; duplicados por clave; población no numérica; localidades agrupadas sin coordenadas (3 662), que no se reparten sobre el área |
| Marco Geoestadístico | `ingest_public.py` (`geometry`) | Reproyección de LCC ITRF2008 a WGS84 con el `.prj`; simplificación al 6% conservando todas las formas; 16 intersecciones reparadas (2 en Puebla, 14 en Oaxaca; 4 de Oaxaca no se pudieron reparar y solo afectan el dibujo) |

## Reproducir

```bash
bash scripts/impact/fetch-raw.sh                       # INEGI + Monitor de Sequía (≈ 420 MB, sin login)
python -I scripts/impact/smn_catalog.py                # catálogo de estaciones SMN
python -I scripts/impact/ingest_public.py population drought geometry stations manifests
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/ts-resolve.mjs scripts/impact/preprocess-power.ts   # snapshot POWER por celda (≈ 145 MB de respuestas)
```

## Excluidas del runtime

| Fuente | Motivo |
|---|---|
| AppEEARS, Giovanni, GES DISC (IMERG directo, GLDAS), Hydrology Time Series | Piden una cuenta Earthdata. IMERG llega sin login por POWER |
| NOAA CDO API v2 | Pide token. GHCN-Daily se usa en la validación por archivos públicos |
| Cualquier servicio con credenciales personales | El jurado no debe crear cuentas. Si una fuente futura lo requiere, entraría como snapshot versionado, nunca como requisito |
