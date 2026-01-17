import sqlite3
conn = sqlite3.connect('/data/data/com.termux/files/home/.gemini/tmp/otaku_mappings/anime_mappings.db')
cursor = conn.cursor()
print("Shingeki no Kyojin entries:")
cursor.execute("SELECT mal_id, mal_title, thetvdb_season, thetvdb_part, anime_media_episodes FROM anime WHERE mal_title LIKE '%Shingeki no Kyojin%'")
rows = cursor.fetchall()
for row in rows:
    print(row)
conn.close()
