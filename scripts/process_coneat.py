#!/usr/bin/env python3
"""
One-time script to pre-process the CONEAT soil shapefile.
Dissolves 33k polygons into 188 CONEAT groups, simplifies geometry,
reprojects to WGS84, and exports compact GeoJSON for the app DB.

Input:  apdn.shp (UTM Zone 21S, EPSG:32721)
Output: coneat_soils.json (WGS84, dissolved by GC code)
"""

import json
import sys
import os
import geopandas as gpd

# Path to the CONEAT shapefile
SHP_DIR = os.path.expanduser(
    "~/Downloads/Estimación de agua disponible en los Grupos CONEAT formato shp"
)
# Try alternate encoding if the folder name doesn't match
if not os.path.isdir(SHP_DIR):
    # Try the raw bytes version from Finder
    for name in os.listdir(os.path.expanduser("~/Downloads")):
        if "CONEAT" in name and "shp" in name:
            SHP_DIR = os.path.join(os.path.expanduser("~/Downloads"), name)
            break

SHP_FILE = os.path.join(SHP_DIR, "apdn.shp")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "coneat_soils.json")

print(f"Reading shapefile: {SHP_FILE}")
if not os.path.isfile(SHP_FILE):
    print(f"ERROR: File not found: {SHP_FILE}")
    sys.exit(1)

# Read shapefile
gdf = gpd.read_file(SHP_FILE)
print(f"  Records: {len(gdf)}, CRS: {gdf.crs}")
print(f"  Columns: {list(gdf.columns)}")

# Dissolve by CONEAT group code, keeping first values of MM, APDN, IP
# (all records with same GC have the same MM/APDN/IP)
print("Dissolving by GC code...")
dissolved = gdf.dissolve(by="GC", aggfunc="first").reset_index()
print(f"  Dissolved to {len(dissolved)} groups")

# Reproject to WGS84
print("Reprojecting to WGS84 (EPSG:4326)...")
dissolved = dissolved.to_crs(epsg=4326)

# Simplify geometry (tolerance in degrees, ~100m at Uruguay's latitude)
print("Simplifying geometry...")
dissolved["geometry"] = dissolved["geometry"].simplify(tolerance=0.001, preserve_topology=True)

# Build output JSON
features = []
for _, row in dissolved.iterrows():
    geom = row["geometry"]
    if geom is None or geom.is_empty:
        continue

    # Convert to GeoJSON dict
    geom_json = json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]

    features.append({
        "gc": str(row["GC"]).strip(),
        "mm": round(float(row["MM"]), 1),
        "apdn": round(float(row["APDN"]), 1),
        "ip": int(row["IP"]),
        "geometry": geom_json,
    })

# Sort by GC code
features.sort(key=lambda f: f["gc"])

output = {
    "type": "coneat_soils",
    "crs": "EPSG:4326",
    "count": len(features),
    "features": features,
}

print(f"Writing {len(features)} features to {OUTPUT_FILE}...")
with open(OUTPUT_FILE, "w") as f:
    json.dump(output, f, separators=(",", ":"))

# Print file size
size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
print(f"Done! Output size: {size_mb:.1f} MB")

# Print sample
print(f"\nSample feature:")
sample = features[0].copy()
sample["geometry"] = f"<{sample['geometry']['type']} with {len(json.dumps(sample['geometry']))} chars>"
print(f"  {json.dumps(sample, indent=2)}")
