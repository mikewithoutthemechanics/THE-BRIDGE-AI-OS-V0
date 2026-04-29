#!/usr/bin/env python3
"""
Bridge AI OS — Database Migration Runner
Applies pending SQL migrations to Supabase/PostgreSQL
"""

import os
import sys
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
DB_DIR = PROJECT_ROOT / "db"
MIGRATIONS_DIR = PROJECT_ROOT / "migrations"

def run_sql_file(filepath: Path, db_url: str):
    """Run a single SQL file against the database"""
    print(f"📄 Running: {filepath.name}")
    try:
        # Try with psql
        result = subprocess.run(
            ["psql", db_url, "-f", str(filepath)],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"   ✅ Success")
            return True
        else:
            print(f"   ❌ Error: {result.stderr[:200]}")
            return False
    except FileNotFoundError:
        print("   ⚠️  psql not found — set DATABASE_URL and ensure PostgreSQL CLI is available")
        return False

def main():
    # Get database URL
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL environment variable not set")
        print("   Example: postgresql://user:pass@localhost:5432/bridge_ai")
        sys.exit(1)

    # Collect all .sql files in order
    sql_files = []
    for mig_dir in [DB_DIR / "migrations", MIGRATIONS_DIR]:
        if mig_dir.exists():
            files = sorted(mig_dir.glob("*.sql"))
            sql_files.extend(files)

    if not sql_files:
        print("❌ No SQL migrations found in db/migrations/ or migrations/")
        sys.exit(1)

    print(f"🔍 Found {len(sql_files)} migration(s):")
    for f in sql_files:
        print(f"   • {f.name}")

    print(f"\n🚀 Running migrations against: {db_url.split('@')[1] if '@' in db_url else db_url}")

    success = 0
    for sql_file in sql_files:
        if run_sql_file(sql_file, db_url):
            success += 1

    print(f"\n✅ {success}/{len(sql_files)} migrations applied successfully")
    print("💡 Restart bridgeai-gateway to pick up new API routes")

if __name__ == "__main__":
    main()
