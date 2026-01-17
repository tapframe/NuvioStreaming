import sqlite3
conn = sqlite3.connect('/data/data/com.termux/files/home/.gemini/tmp/otaku_mappings/anime_mappings.db')
cursor = conn.cursor()
print("Shingeki no Kyojin Season 3 details:")
cursor.execute("SELECT mal_id, mal_title, thetvdb_season, thetvdb_part, anime_media_episodes, global_media_episodes FROM anime WHERE mal_title LIKE 'Shingeki no Kyojin Season 3%'")
rows = cursor.fetchall()
for row in rows:
    print(row)

print("\nOne Piece details:")
cursor.execute("SELECT mal_id, mal_title, thetvdb_season, thetvdb_part, anime_media_episodes, global_media_episodes FROM anime WHERE mal_title = 'One Piece'")
rows = cursor.fetchall()
for row in rows:
    print(row)
conn.close()
