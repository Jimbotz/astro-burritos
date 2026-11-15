# Figures for the report

`main.tex` looks for these files. If a file is missing, the PDF shows a framed placeholder in its place, so the report always compiles.

| File | What to capture |
|---|---|
| `globe.png` | Landing page: the 3D globe with a country/state selected |
| `result-puebla.png` | Puebla, T2M, 2001–2024 after pressing Analyze: headline, verdict and annual series |
| `area-map.png` | 2D map of Puebla's native POWER cells (trend layer, significant cells outlined) |
| `crosscheck.png` | "Two NASA rain records" card for Tlaxcala (verdict: Disagree) |
| `projection.png` | Exploratory projection panel with its 95% prediction interval |

PNG or JPG both work; keep the names (or edit the `\screenshot{...}` calls in `main.tex`).
