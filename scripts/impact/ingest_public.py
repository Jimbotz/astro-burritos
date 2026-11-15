"""Ingestion of the bundled public sources of the impact lenses (IMPLEMENTACION_LENTES_IMPACTO §4–5).

Raw files come from scripts/impact/fetch-raw.sh (data/impact/raw/, git-ignored; URL, time and SHA-256 recorded).
Each source goes through ingest -> schema -> coordinates -> dates -> duplicates -> fill values -> units ->
impossible values -> coverage -> normalization -> aggregation, and only the processed subset is written to
data/impact/derived/ (and the simplified municipal outlines to public/geo/municipios/). Anomalous values are counted
and flagged, never silently dropped; missing values are never turned into zeros.

Steps (run in order, standard library only, `python -I`):
  population  INEGI ITER 2020 -> inegi-municipalities.json, inegi-cell-population.json
  drought     SMN Drought Monitor (municipal) -> smn-drought-municipal.json
  geometry    INEGI Marco Geoestadistico 2020 (XXmun layer) -> public/geo/municipios/XX.json (needs npm for mapshaper)
  stations    SMN daily station records near the study cells -> smn-stations.json
  manifests   data/impact/manifests/*.json
"""
import csv
import datetime as dt
import hashlib
import io
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, 'data', 'impact', 'raw')
DERIVED = os.path.join(ROOT, 'data', 'impact', 'derived')
MANIFESTS = os.path.join(ROOT, 'data', 'impact', 'manifests')
STUDY_STATES = {'21': 'puebla', '29': 'tlaxcala', '20': 'oaxaca'}
UA = 'Mozilla/5.0 (compatible; EarthScope data ingestion; NASA Space Apps 2026)'
CELL_LAT, CELL_LON = 0.5, 0.625
MEXICO_BOX = (14.0, 33.5, -118.6, -86.5)  # lat min/max, lon min/max


def js_round(value):
    """Math.round of JavaScript (halves go up), so cell ids match lib/nasa/power.ts exactly."""
    return math.floor(value + 0.5)


def cell_id(lat, lon):
    clat = js_round(lat / CELL_LAT) * CELL_LAT
    clon = js_round(lon / CELL_LON) * CELL_LON
    return f'{clat:.3f}_{clon:.3f}'


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, data, compact=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(',', ':') if compact else None, indent=None if compact else 1)
    print(f'  -> {os.path.relpath(path, ROOT)} ({os.path.getsize(path) // 1024} kB)')


def downloads():
    """Rows of data/impact/raw/downloads.tsv: file, url, retrievedAt, bytes, sha256."""
    rows = {}
    path = os.path.join(RAW, 'downloads.tsv')
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            parts = line.rstrip('\n').split('\t')
            if len(parts) == 5:
                rows[os.path.basename(parts[0])] = {'file': parts[0], 'url': parts[1], 'retrievedAt': parts[2], 'bytes': int(parts[3]), 'sha256': parts[4]}
    return rows


# ---------------------------------------------------------------- INEGI ITER 2020: population by locality

DMS = re.compile(r'\s*(\d+)°(\d+)\'([\d.]+)"\s*([NSEW])')


def dms(text):
    match = DMS.match(text or '')
    if not match:
        return None
    value = int(match.group(1)) + int(match.group(2)) / 60 + float(match.group(3)) / 3600
    return -value if match.group(4) in 'SW' else value


def population():
    path = os.path.join(RAW, 'inegi', 'iter_00_cpv2020_csv.zip')
    archive = zipfile.ZipFile(path)
    member = 'iter_00_cpv2020/conjunto_de_datos/conjunto_de_datos_iter_00CSV20.csv'
    reader = csv.DictReader(io.TextIOWrapper(archive.open(member), encoding='utf-8-sig'))
    municipalities, cells, seen = {}, {}, set()
    quality = {'rows': 0, 'localities': 0, 'withCoordinates': 0, 'invalidCoordinates': 0, 'duplicates': 0, 'nonNumericPopulation': 0, 'groupedWithoutCoordinates': 0}
    for row in reader:
        quality['rows'] += 1
        ent, mun, loc = row['ENTIDAD'], row['MUN'], row['LOC']
        if mun == '000':
            continue  # national and state totals
        code = ent + mun
        key = code + loc
        if key in seen:
            quality['duplicates'] += 1
            continue
        seen.add(key)
        pop_text = (row['POBTOT'] or '').strip()
        pop = int(pop_text) if pop_text.isdigit() else None
        entry = municipalities.setdefault(code, {'code': code, 'name': row['NOM_MUN'], 'stateCode': ent, 'stateName': row['NOM_ENT'], 'population': None, 'urbanPopulation': 0, 'placedPopulation': 0, 'seat': None})
        if loc == '0000':
            entry['population'] = pop
            continue
        if pop is None:
            quality['nonNumericPopulation'] += 1
            continue
        if loc in ('9998', '9999'):
            quality['groupedWithoutCoordinates'] += 1  # one- and two-dwelling localities: no coordinates
            continue
        quality['localities'] += 1
        if pop >= 2500:  # INEGI: a locality with 2,500 inhabitants or more is urban
            entry['urbanPopulation'] += pop
        lat, lon = dms(row['LATITUD']), dms(row['LONGITUD'])
        if lat is None or lon is None or not (MEXICO_BOX[0] <= lat <= MEXICO_BOX[1] and MEXICO_BOX[2] <= lon <= MEXICO_BOX[3]):
            quality['invalidCoordinates'] += 1
            continue
        quality['withCoordinates'] += 1
        entry['placedPopulation'] += pop
        if entry['seat'] is None or pop > entry['seat']['population']:
            entry['seat'] = {'name': row['NOM_LOC'], 'lat': round(lat, 5), 'lon': round(lon, 5), 'population': pop}
        cell = cells.setdefault(cell_id(lat, lon), [0, 0, 0])
        cell[0] += pop
        cell[1] += pop if pop >= 2500 else 0
        cell[2] += 1
    for entry in municipalities.values():
        total = entry['population']
        entry['urbanFraction'] = round(entry['urbanPopulation'] / total, 4) if total else None
        entry['placedPopulationShare'] = round(entry['placedPopulation'] / total, 4) if total else None
    info = downloads().get('iter_00_cpv2020_csv.zip', {})
    write_json(os.path.join(DERIVED, 'inegi-municipalities.json'), {
        'sourceId': 'inegi-iter-2020', 'product': 'Censo de Población y Vivienda 2020, Principales resultados por localidad (ITER)', 'populationYear': 2020,
        'url': info.get('url'), 'sha256': info.get('sha256'), 'retrievedAt': info.get('retrievedAt'), 'quality': quality,
        'urbanRule': 'Urban population = people in localities with 2,500 inhabitants or more (INEGI definition).',
        'municipalities': sorted(municipalities.values(), key=lambda item: item['code']),
    })
    write_json(os.path.join(DERIVED, 'inegi-cell-population.json'), {
        'sourceId': 'inegi-iter-2020', 'populationYear': 2020, 'grid': 'NASA POWER MERRA-2 cells (0.5° x 0.625°), cell id as lib/nasa/power.ts',
        'rule': 'Each locality with coordinates adds its population to the cell that contains it; localities without coordinates are not spread over the area.',
        'fields': ['population', 'urbanPopulation', 'localities'], 'cells': cells,
    })
    print('  quality', quality)


# ---------------------------------------------------------------- SMN Drought Monitor (Monitor de Sequía de México)

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
CATEGORY = {'D0': '0', 'D1': '1', 'D2': '2', 'D3': '3', 'D4': '4'}


def column_index(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    index = 0
    for char in letters:
        index = index * 26 + ord(char) - 64
    return index - 1


def drought():
    path = os.path.join(RAW, 'smn', 'MunicipiosSequia.xlsx')
    book = zipfile.ZipFile(path)
    strings = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in ET.fromstring(book.read('xl/sharedStrings.xml')).iter(NS + 'si')]
    header, municipalities = None, {}
    quality = {'rows': 0, 'unknownCategories': 0, 'duplicates': 0}
    for _, element in ET.iterparse(book.open('xl/worksheets/sheet1.xml')):
        if element.tag != NS + 'row':
            continue
        cells = {}
        for c in element.findall(NS + 'c'):
            v = c.find(NS + 'v')
            value = v.text if v is not None else None
            if c.get('t') == 's' and value is not None:
                value = strings[int(value)]
            cells[column_index(c.get('r'))] = value
        element.clear()
        if header is None:
            header = cells
            date_columns = sorted(index for index in header if index >= 9)
            dates = [(dt.date(1899, 12, 30) + dt.timedelta(days=int(float(header[index])))).isoformat() for index in date_columns]
            continue
        quality['rows'] += 1
        code = (cells.get(0) or '').strip()
        if not re.fullmatch(r'\d{5}', code):
            continue
        if code in municipalities:
            quality['duplicates'] += 1
            continue
        series = []
        for index in date_columns:
            value = (cells.get(index) or '').strip()
            if value == '':
                series.append('-')  # no drought category on that date
            elif value in CATEGORY:
                series.append(CATEGORY[value])
            else:
                series.append('?')
                quality['unknownCategories'] += 1
        municipalities[code] = {'name': cells.get(3), 'stateCode': code[:2], 'series': ''.join(series)}
    info = downloads().get('MunicipiosSequia.xlsx', {})
    write_json(os.path.join(DERIVED, 'smn-drought-municipal.json'), {
        'sourceId': 'smn-drought-monitor', 'product': 'Monitor de Sequía de México (MSM), municipios con sequía', 'url': info.get('url'), 'sha256': info.get('sha256'), 'retrievedAt': info.get('retrievedAt'),
        'encoding': "One character per date: '-' no drought category, '0'..'4' = D0 (abnormally dry) .. D4 (exceptional drought), '?' unreadable.",
        'quality': quality, 'dates': dates, 'municipalities': municipalities,
    })
    print(f'  {len(municipalities)} municipalities, {len(dates)} dates {dates[0]}..{dates[-1]}', quality)


# ---------------------------------------------------------------- INEGI Marco Geoestadístico 2020: municipal outlines

def mapshaper(*args):
    command = ['npm', 'exec', '--yes', '--ignore-scripts', '--package=mapshaper@0.7.101', '--', 'mapshaper', *args]
    subprocess.run(command, check=True, shell=(os.name == 'nt'))


def geometry():
    out_dir = os.path.join(ROOT, 'public', 'geo', 'municipios')
    os.makedirs(out_dir, exist_ok=True)
    for code, name in STUDY_STATES.items():
        archive_path = os.path.join(RAW, 'inegi', f'mg2020_{code}_{name}.zip')
        if not os.path.exists(archive_path):
            print(f'  missing {archive_path}; run scripts/impact/fetch-raw.sh first')
            continue
        target = os.path.join(RAW, 'inegi', 'mun', code)
        os.makedirs(target, exist_ok=True)
        with zipfile.ZipFile(archive_path) as archive:
            for member in archive.namelist():
                if re.search(rf'conjunto_de_datos/{code}mun\.(shp|shx|dbf|prj|cpg)$', member):
                    with archive.open(member) as source, open(os.path.join(target, os.path.basename(member)), 'wb') as dest:
                        dest.write(source.read())
        shp = os.path.join(target, f'{code}mun.shp')
        out = os.path.join(out_dir, f'{code}.json')
        mapshaper('-i', shp, '-proj', 'wgs84', '-simplify', 'dp', '6%', 'keep-shapes', '-filter-fields', 'CVEGEO,NOMGEO,CVE_ENT',
                  '-rename-fields', 'code=CVEGEO,name=NOMGEO,stateCode=CVE_ENT', '-o', 'format=geojson', 'precision=0.0001', out)
        print(f'  -> public/geo/municipios/{code}.json ({os.path.getsize(out) // 1024} kB)')


# ---------------------------------------------------------------- SMN daily station records

STATION_URL = 'https://smn.conagua.gob.mx/tools/RESOURCES/Normales_Climatologicas/Diarios/{folder}/dia{station}.txt'
FOLDERS = {'21': 'pue', '29': 'tlax', '20': 'oax'}
QUOTA = {'21': 30, '29': 12, '20': 38}
BOUNDS = {'precipitation': (0.0, 500.0), 'tmax': (-40.0, 60.0), 'tmin': (-50.0, 50.0)}


def fetch(url, dest):
    if not os.path.exists(dest) or os.path.getsize(dest) == 0:
        request = urllib.request.Request(url, headers={'User-Agent': UA})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=90) as response, open(dest + '.part', 'wb') as handle:
                    handle.write(response.read())
                os.replace(dest + '.part', dest)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(4 * (attempt + 1))
    return dest


def parse_station(path):
    """Normalized daily records of one SMN file, with quality counts (NULO = missing, never zero)."""
    records, seen = {}, set()
    quality = {'lines': 0, 'invalidDates': 0, 'duplicates': 0, 'outOfBounds': {'precipitation': 0, 'tmax': 0, 'tmin': 0}, 'tminAboveTmax': 0, 'missing': {'precipitation': 0, 'tmax': 0, 'tmin': 0}}
    started = False
    for line in open(path, encoding='utf-8', errors='replace'):
        if line.startswith('FECHA'):
            started = True
            continue
        if not started:
            continue
        parts = line.strip().split('\t')
        if len(parts) < 5 or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', parts[0]):
            continue
        quality['lines'] += 1
        try:
            date = dt.date.fromisoformat(parts[0])
        except ValueError:
            quality['invalidDates'] += 1
            continue
        if date in seen:
            quality['duplicates'] += 1
            continue
        seen.add(date)
        values = {}
        for name, raw in (('precipitation', parts[1]), ('tmax', parts[3]), ('tmin', parts[4])):
            raw = raw.strip()
            if raw in ('', 'NULO'):
                quality['missing'][name] += 1
                values[name] = None
                continue
            try:
                value = float(raw)
            except ValueError:
                quality['missing'][name] += 1
                values[name] = None
                continue
            low, high = BOUNDS[name]
            if not low <= value <= high:
                quality['outOfBounds'][name] += 1  # flagged and left out of the aggregates
                values[name] = None
                continue
            values[name] = value
        if values['tmax'] is not None and values['tmin'] is not None and values['tmin'] > values['tmax']:
            quality['tminAboveTmax'] += 1
            values['tmax'] = values['tmin'] = None
        records[date] = values
    return records, quality


def annual(records, variable, years, mode):
    """Annual precipitation total (mean of valid days x days in the year) or mean temperature, with >= 90% valid days."""
    out, valid_days = [], []
    for year in years:
        days = (dt.date(year + 1, 1, 1) - dt.date(year, 1, 1)).days
        values = [records[day][variable] for day in records if day.year == year and records[day][variable] is not None]
        valid_days.append(len(values))
        if len(values) / days >= 0.9:
            mean = sum(values) / len(values)
            out.append(round(mean * days, 1) if mode == 'sum' else round(mean, 2))
        else:
            out.append(None)
    return out, valid_days


def stations():
    catalog = [item for item in json.load(open(os.path.join(RAW, 'smn', 'catalog.json'), encoding='utf-8')) if 'error' not in item and item.get('lat') and item.get('lon')]
    population = json.load(open(os.path.join(DERIVED, 'inegi-cell-population.json'), encoding='utf-8'))['cells']
    years = list(range(1981, 2026))
    out_dir = os.path.join(RAW, 'smn', 'stations')
    os.makedirs(out_dir, exist_ok=True)
    selected, attempts = [], 0
    for state, quota in QUOTA.items():
        by_cell = {}
        for item in catalog:
            if item['stateCode'] != state:
                continue
            item['cellId'] = cell_id(item['lat'], item['lon'])
            by_cell.setdefault(item['cellId'], []).append(item)
        ranked = sorted(by_cell, key=lambda cell: -(population.get(cell, [0])[0]))
        taken = 0
        for cell in ranked:
            if taken >= quota:
                break
            clat, clon = (float(part) for part in cell.split('_'))
            candidates = sorted(by_cell[cell], key=lambda item: (item.get('status') != 'OPERANDO', (item['lat'] - clat) ** 2 + (item['lon'] - clon) ** 2))
            for item in candidates[:2]:
                attempts += 1
                path = fetch(item['url'], os.path.join(out_dir, f"dia{item['id']}.txt"))
                records, quality = parse_station(path)
                precip, precip_days = annual(records, 'precipitation', years, 'sum')
                complete_recent = sum(1 for year, value in zip(years, precip) if 2001 <= year <= 2024 and value is not None)
                if complete_recent < 15:
                    continue
                tmax, _ = annual(records, 'tmax', years, 'mean')
                tmin, _ = annual(records, 'tmin', years, 'mean')
                dates = sorted(records)
                selected.append({
                    'stationId': f"CONAGUA_{item['id']}", 'id': item['id'], 'name': item.get('name'), 'municipality': item.get('municipality'), 'state': item.get('state'), 'stateCode': state,
                    'status': item.get('status'), 'lat': item['lat'], 'lon': item['lon'], 'altitude': item.get('altitude'), 'cellId': cell, 'cellPopulation': population.get(cell, [None])[0],
                    'url': item['url'], 'sha256': sha256(path), 'retrievedAt': dt.datetime.fromtimestamp(os.path.getmtime(path), dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'firstDate': dates[0].isoformat() if dates else None, 'lastDate': dates[-1].isoformat() if dates else None,
                    'years': years, 'precipitation': precip, 'precipitationValidDays': precip_days, 'tmax': tmax, 'tmin': tmin, 'quality': quality,
                })
                taken += 1
                break
        print(f'  state {state}: {taken} stations')
    write_json(os.path.join(DERIVED, 'smn-stations.json'), {
        'sourceId': 'conagua-smn-stations', 'product': 'SMN Base de Datos Climatológica Nacional, registro diario histórico por estación',
        'rule': 'A year counts with at least 90% valid days; the annual precipitation total is the mean of the valid days times the days in the year (stated, not hidden). NULO is missing, never zero. Out-of-range values and Tmin > Tmax days are counted and left out.',
        'selection': 'Per study state, MERRA-2 cells ranked by INEGI 2020 population; in each cell the operating station nearest to the cell centre with at least 15 complete years in 2001-2024.',
        'downloadAttempts': attempts, 'stations': selected,
    })


# ---------------------------------------------------------------- manifests

def manifests():
    rows = downloads()
    stations_file = os.path.join(DERIVED, 'smn-stations.json')
    station_data = json.load(open(stations_file, encoding='utf-8')) if os.path.exists(stations_file) else {'stations': []}
    station_dates = [item['retrievedAt'] for item in station_data['stations']]
    mg = [rows.get(f'mg2020_{code}_{name}.zip') for code, name in STUDY_STATES.items()]
    items = {
        'nasa-power': {'sourceId': 'nasa-power', 'provider': 'NASA', 'product': 'POWER API v2.10 / MERRA-2 (meteorology), CERES SYN1deg and GEWEX SRB (radiation), GPM IMERG (cross-check rain)', 'url': 'https://power.larc.nasa.gov/', 'retrievedAt': 'live (each response records its own retrievedAt)', 'coverage': {'start': '1981-01-01', 'end': '2025-12-31'}, 'resolution': 'MERRA-2 cell 0.5° x 0.625°', 'timeStandard': 'LST (IMERG: UTC)', 'authRequired': False, 'accessMode': 'public-api', 'license': 'NASA POWER data terms (public, attribution requested)', 'checksum': None},
        'conagua-smn-stations': {'sourceId': 'conagua-smn-stations', 'provider': 'CONAGUA / SMN', 'product': 'Base de Datos Climatológica Nacional, registro diario histórico por estación', 'url': 'https://smn.conagua.gob.mx/es/climatologia/informacion-climatologica/informacion-estadistica-climatologica', 'retrievedAt': max(station_dates) if station_dates else None, 'coverage': {'start': '1981-01-01', 'end': '2025-12-31'}, 'resolution': 'weather station', 'timeStandard': 'local day', 'authRequired': False, 'accessMode': 'bundled-snapshot', 'license': 'Datos abiertos del Gobierno de México', 'checksum': hashlib.sha256(open(stations_file, 'rb').read()).hexdigest() if os.path.exists(stations_file) else None, 'files': [{'url': item['url'], 'sha256': item['sha256']} for item in station_data['stations']]},
        'smn-drought-monitor': {'sourceId': 'smn-drought-monitor', 'provider': 'CONAGUA / SMN', 'product': 'Monitor de Sequía de México, municipios con sequía (MunicipiosSequia.xlsx)', 'url': rows.get('MunicipiosSequia.xlsx', {}).get('url'), 'retrievedAt': rows.get('MunicipiosSequia.xlsx', {}).get('retrievedAt'), 'coverage': {'start': '2003-01-31', 'end': None}, 'resolution': 'municipality', 'timeStandard': None, 'authRequired': False, 'accessMode': 'bundled-snapshot', 'license': 'Datos abiertos del Gobierno de México', 'checksum': rows.get('MunicipiosSequia.xlsx', {}).get('sha256')},
        'inegi-iter-2020': {'sourceId': 'inegi-iter-2020', 'provider': 'INEGI', 'product': 'Censo de Población y Vivienda 2020, ITER (población por localidad con coordenadas)', 'url': rows.get('iter_00_cpv2020_csv.zip', {}).get('url'), 'retrievedAt': rows.get('iter_00_cpv2020_csv.zip', {}).get('retrievedAt'), 'coverage': {'start': '2020-03-15', 'end': '2020-03-15'}, 'resolution': 'locality', 'timeStandard': None, 'authRequired': False, 'accessMode': 'bundled-snapshot', 'license': 'Términos de libre uso de la información del INEGI', 'checksum': rows.get('iter_00_cpv2020_csv.zip', {}).get('sha256')},
        'inegi-mg-2020': {'sourceId': 'inegi-mg-2020', 'provider': 'INEGI', 'product': 'Marco Geoestadístico 2020, áreas geoestadísticas municipales (Puebla, Tlaxcala, Oaxaca), simplificadas', 'url': 'https://www.inegi.org.mx/temas/mg/', 'retrievedAt': max((item['retrievedAt'] for item in mg if item), default=None), 'coverage': {'start': '2020-01-01', 'end': '2020-12-31'}, 'resolution': 'municipality (simplified to 6% of vertices)', 'timeStandard': None, 'authRequired': False, 'accessMode': 'bundled-snapshot', 'license': 'Términos de libre uso de la información del INEGI', 'checksum': None, 'files': [{'url': item['url'], 'sha256': item['sha256'], 'bytes': item['bytes']} for item in mg if item]},
        'fao-56': {'sourceId': 'fao-56', 'provider': 'FAO', 'product': 'Irrigation and Drainage Paper 56: Crop evapotranspiration (Penman–Monteith reference ET0)', 'url': 'https://www.fao.org/4/X0490E/x0490e0b.htm', 'retrievedAt': None, 'coverage': None, 'resolution': 'method', 'timeStandard': None, 'authRequired': False, 'accessMode': 'method', 'license': 'FAO publication (method reference, not observations)', 'checksum': None},
        'open-meteo': {'sourceId': 'open-meteo', 'provider': 'Open-Meteo', 'product': 'Historical Weather API (ERA5 / ERA5-Land)', 'url': 'https://open-meteo.com/en/docs/historical-weather-api', 'retrievedAt': None, 'coverage': None, 'resolution': 'reanalysis grid', 'timeStandard': None, 'authRequired': False, 'accessMode': 'public-api', 'license': 'CC BY 4.0, non-commercial use without a key', 'checksum': None, 'status': 'optional, not used by the runtime'},
    }
    os.makedirs(MANIFESTS, exist_ok=True)
    for source_id, body in items.items():
        write_json(os.path.join(MANIFESTS, f'{source_id}.json'), body, compact=False)


if __name__ == '__main__':
    steps = {'population': population, 'drought': drought, 'geometry': geometry, 'stations': stations, 'manifests': manifests}
    for name in sys.argv[1:] or list(steps):
        print(f'[{name}]')
        steps[name]()
