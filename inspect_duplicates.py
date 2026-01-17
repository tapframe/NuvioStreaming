import sqlite3
conn = sqlite3.connect('/data/data/com.termux/files/home/.gemini/tmp/otaku_mappings/anime_mappings.db')
cursor = conn.cursor()
cursor.execute("SELECT imdb_id, COUNT(*) c FROM anime WHERE imdb_id IS NOT NULL GROUP BY imdb_id HAVING c > 1 LIMIT 5")
rows = cursor.fetchall()
print("Duplicate IMDB IDs:")
for row in rows:
    print(row)
    # Check details for one
    cursor.execute(f"SELECT mal_id, mal_title, thetvdb_season, anime_media_episodes FROM anime WHERE imdb_id = '{row[0]}'")
    details = cursor.fetchall()
    for d in details:
        print(f"  - {d}")
conn.close()
