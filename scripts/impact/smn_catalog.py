"""Builds the SMN (CONAGUA) station catalog for the study states from the public daily-record files.

The SMN does not publish a downloadable station list, so each candidate id is probed with a range request for the
first 1.5 kB of its daily file, whose header carries id, name, state, municipality, status and coordinates.
Writes data/impact/raw/smn/catalog.json (git-ignored). Standard library only: run with `python -I`.
"""
import concurrent.futures
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = 'https://smn.conagua.gob.mx/tools/RESOURCES/Normales_Climatologicas/Diarios/{folder}/dia{station}.txt'
STATES = {'21': 'pue', '29': 'tlax', '20': 'oax'}
UA = 'Mozilla/5.0 (compatible; EarthScope data ingestion; NASA Space Apps 2026)'
FIELDS = {'ESTACIÓN': 'id', 'NOMBRE': 'name', 'ESTADO': 'state', 'MUNICIPIO': 'municipality', 'SITUACIÓN': 'status', 'LATITUD': 'lat', 'LONGITUD': 'lon', 'ALTITUD': 'altitude'}


def header(state, folder, number):
    station = f'{state}{number:03d}'
    url = BASE.format(folder=folder, station=station)
    request = urllib.request.Request(url, headers={'User-Agent': UA, 'Range': 'bytes=0-1500'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                text = response.read().decode('utf-8', errors='replace')
            break
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            if attempt == 2:
                return {'id': station, 'url': url, 'stateCode': state, 'error': f'HTTP {error.code}'}
        except Exception as error:  # network hiccup: retry, then record it
            if attempt == 2:
                return {'id': station, 'url': url, 'stateCode': state, 'error': str(error)}
    if 'ESTACI' not in text:
        return None
    record = {'url': url}
    for line in text.splitlines():
        match = re.match(r'\s*([A-ZÁÉÍÓÚÑ\-\. ]+?)\s*:\s*(.*?)\s*$', line)
        if match and match.group(1) in FIELDS:
            record[FIELDS[match.group(1)]] = match.group(2)
    for key in ('lat', 'lon'):
        value = re.match(r'(-?\d+(?:\.\d+)?)', record.get(key, ''))
        record[key] = float(value.group(1)) if value else None
    altitude = re.match(r'(-?\d+(?:\.\d+)?)', record.get('altitude', ''))
    record['altitude'] = float(altitude.group(1)) if altitude else None
    record['id'] = record.get('id', station).strip()
    record['stateCode'] = state
    return record


def main():
    jobs = [(state, folder, number) for state, folder in STATES.items() for number in range(1, 400)]
    found = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for record in pool.map(lambda job: header(*job), jobs):
            if record:
                found.append(record)
    # Second pass for the ids that failed (rate limits or timeouts), slower.
    failed = [item for item in found if 'error' in item]
    found = [item for item in found if 'error' not in item]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for record in pool.map(lambda item: header(item['stateCode'], STATES[item['stateCode']], int(item['id'][-3:])), failed):
            if record:
                found.append(record)
    found.sort(key=lambda item: item['id'])
    out = os.path.join(ROOT, 'data', 'impact', 'raw', 'smn', 'catalog.json')
    with open(out, 'w', encoding='utf-8') as handle:
        json.dump(found, handle, ensure_ascii=False, indent=1)
    errors = [item for item in found if 'error' in item]
    print(f'{len(found)} stations ({len(errors)} with errors) -> {out}')
    for state in STATES:
        print(state, sum(1 for item in found if item['stateCode'] == state and 'error' not in item))


if __name__ == '__main__':
    sys.exit(main())
