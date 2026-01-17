import json

with open('/data/data/com.termux/files/home/.gemini/tmp/plex_ani_bridge_mappings/mappings.json', 'r') as f:
    data = json.load(f)

# Find Attack on Titan Season 3 Part 2 (MAL ID 38524)
target_mal_id = 38524
found_entry = None
found_key = None

for key, value in data.items():
    mal_ids = value.get('mal_id')
    if mal_ids:
        if isinstance(mal_ids, list):
            if target_mal_id in mal_ids:
                found_entry = value
                found_key = key
                break
        elif mal_ids == target_mal_id:
            found_entry = value
            found_key = key
            break

print(f"Entry for MAL ID {target_mal_id}:")
print(json.dumps({found_key: found_entry}, indent=2))

# Check for reverse lookup capability (IMDb -> MAL)
print("\nChecking duplicates for IMDb IDs...")
imdb_map = {}
duplicates = 0
for key, value in data.items():
    imdb_ids = value.get('imdb_id')
    if not imdb_ids:
        continue
    if not isinstance(imdb_ids, list):
        imdb_ids = [imdb_ids]
    
    for imdb in imdb_ids:
        if imdb in imdb_map:
            duplicates += 1
            # print(f"Duplicate IMDb: {imdb} -> {imdb_map[imdb]} and {key}")
        else:
            imdb_map[imdb] = key

print(f"Total entries: {len(data)}")
print(f"Unique IMDb IDs mapped: {len(imdb_map)}")
print(f"Duplicate IMDb references: {duplicates}")
