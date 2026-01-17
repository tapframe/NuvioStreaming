import sqlite3
conn = sqlite3.connect('/data/data/com.termux/files/home/.gemini/tmp/otaku_mappings/anime_mappings.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print(f"Tables: {tables}")
for table in tables:
    table_name = table[0]
    print(f"\nSchema for {table_name}:")
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    for col in columns:
        print(col)
    print(f"\nFirst 5 rows of {table_name}:")
    cursor.execute(f"SELECT * FROM {table_name} LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
conn.close()
