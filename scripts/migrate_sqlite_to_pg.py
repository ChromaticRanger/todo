#!/usr/bin/env python3
"""
Migrate todo data from local SQLite files to PostgreSQL.

Usage:
    DATABASE_URL=postgresql://... python3 scripts/migrate_sqlite_to_pg.py

Scans ~/.local/share/todo/*.db for SQLite databases and inserts all rows
into the PostgreSQL database with the correct list_name derived from filename.
"""

import os
import sqlite3
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("Error: psycopg2 is required. Install it with: pip install psycopg2-binary")
    sys.exit(1)


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    list_name TEXT NOT NULL DEFAULT 'todos',
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'General',
    priority INTEGER DEFAULT 2,
    status INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    due_date BIGINT,
    repeat_days INTEGER DEFAULT 0,
    repeat_months INTEGER DEFAULT 0,
    spawned_next INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_list_name ON todos(list_name);
CREATE INDEX IF NOT EXISTS idx_list_category ON todos(list_name, category);
CREATE INDEX IF NOT EXISTS idx_list_status ON todos(list_name, status);
"""

INSERT_SQL = """
INSERT INTO todos (
    list_name, title, description, category, priority, status,
    created_at, completed_at, due_date,
    repeat_days, repeat_months, spawned_next
) VALUES (
    %s, %s, %s, %s, %s, %s,
    to_timestamp(%s), CASE WHEN %s IS NOT NULL THEN to_timestamp(%s) ELSE NULL END,
    %s, %s, %s, %s
)
"""


def get_sqlite_db_dir():
    home = Path.home()
    return home / ".local" / "share" / "todo"


def migrate_sqlite_file(pg_cursor, db_path: Path, list_name: str) -> int:
    if not db_path.exists():
        print(f"  Skipping {db_path} (not found)")
        return 0

    sqlite_conn = sqlite3.connect(str(db_path))
    sqlite_conn.row_factory = sqlite3.Row
    cursor = sqlite_conn.cursor()

    # Check if todos table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'")
    if not cursor.fetchone():
        print(f"  No 'todos' table in {db_path.name}, skipping")
        sqlite_conn.close()
        return 0

    # Fetch all columns present in this database
    cursor.execute("PRAGMA table_info(todos)")
    columns = {row["name"] for row in cursor.fetchall()}

    # Build SELECT to handle optional columns added by migrations
    select_cols = [
        "id", "title", "description", "category", "priority", "status",
        "created_at", "completed_at", "due_date",
    ]
    optional_cols = ["repeat_days", "repeat_months", "spawned_next"]
    for col in optional_cols:
        if col not in columns:
            select_cols.append(f"0 AS {col}")
        else:
            select_cols.append(col)

    cursor.execute(f"SELECT {', '.join(select_cols)} FROM todos")
    rows = cursor.fetchall()
    sqlite_conn.close()

    count = 0
    for row in rows:
        # Convert SQLite timestamps (stored as 'YYYY-MM-DD HH:MM:SS' text)
        # to Unix epoch for to_timestamp() in PostgreSQL.
        created_at = _sqlite_ts_to_epoch(row["created_at"])
        completed_at = _sqlite_ts_to_epoch(row["completed_at"])

        # due_date is already stored as a Unix timestamp integer (or NULL)
        due_date = row["due_date"]

        pg_cursor.execute(INSERT_SQL, (
            list_name,
            row["title"],
            row["description"] or "",
            row["category"] or "General",
            row["priority"] if row["priority"] is not None else 2,
            row["status"] if row["status"] is not None else 0,
            created_at,
            completed_at, completed_at,  # appears twice for CASE WHEN check
            due_date,
            row["repeat_days"] if row["repeat_days"] is not None else 0,
            row["repeat_months"] if row["repeat_months"] is not None else 0,
            row["spawned_next"] if row["spawned_next"] is not None else 0,
        ))
        count += 1

    return count


def _sqlite_ts_to_epoch(ts_value):
    """Convert a SQLite timestamp to a Unix epoch float, or None."""
    if ts_value is None:
        return None
    # May already be an integer (epoch)
    if isinstance(ts_value, (int, float)):
        return ts_value if ts_value > 0 else None
    # Try parsing as 'YYYY-MM-DD HH:MM:SS'
    from datetime import datetime, timezone
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(str(ts_value), fmt).replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except ValueError:
            continue
    return None


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL environment variable is not set")
        sys.exit(1)

    sqlite_dir = get_sqlite_db_dir()
    if not sqlite_dir.exists():
        print(f"No SQLite data directory found at {sqlite_dir}")
        print("Nothing to migrate.")
        sys.exit(0)

    db_files = sorted(sqlite_dir.glob("*.db"))
    if not db_files:
        print(f"No .db files found in {sqlite_dir}")
        print("Nothing to migrate.")
        sys.exit(0)

    print(f"Found {len(db_files)} SQLite database(s) in {sqlite_dir}")
    for f in db_files:
        print(f"  {f.name}")

    print(f"\nConnecting to PostgreSQL...")
    try:
        pg_conn = psycopg2.connect(db_url)
    except Exception as e:
        print(f"Error: Cannot connect to PostgreSQL: {e}")
        sys.exit(1)

    pg_cursor = pg_conn.cursor()

    print("Creating schema (if not exists)...")
    pg_cursor.execute(CREATE_TABLE_SQL)

    total = 0
    for db_path in db_files:
        # Derive list name from filename (e.g. 'todos.db' -> 'todos')
        list_name = db_path.stem
        print(f"\nMigrating '{list_name}' from {db_path.name}...")
        try:
            count = migrate_sqlite_file(pg_cursor, db_path, list_name)
            print(f"  Inserted {count} todo(s)")
            total += count
        except Exception as e:
            print(f"  Error migrating {db_path.name}: {e}")
            pg_conn.rollback()
            pg_conn.close()
            sys.exit(1)

    pg_conn.commit()
    pg_conn.close()

    print(f"\nMigration complete. {total} todo(s) migrated to PostgreSQL.")


if __name__ == "__main__":
    main()
