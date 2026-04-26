#!/usr/bin/env python3
"""
Bridge AI OS — Vendor & Inventory Setup Wizard
One-command setup for the complete vendor/inventory management system

Usage:
    python3 setup_vendor_inventory.py [--skip-migrations] [--skip-patch] [--skip-verify]

Steps:
  1. Apply SQL migrations to Supabase
  2. Patch gateway.js with API routes
  3. Verify endpoints are reachable
  4. Optionally seed initial data (VENDORS + INVENTORY)
"""

import argparse
import subprocess
import sys
from pathlib import Path
import webbrowser
import os

PROJECT_ROOT = Path(__file__).parent
MIGRATION_FILE = PROJECT_ROOT / "db/migrations/004_vendor_inventory_management.sql"
PATCH_SCRIPT = PROJECT_ROOT / "patch_gateway_vendor_inventory_routes.py"
VERIFY_SCRIPT = PROJECT_ROOT / "verify_vendor_api.py"
BULK_IMPORT_SCRIPT = PROJECT_ROOT / "bulk_add_vendors.py"

def run_step(name, func):
    print(f"\n{'='*60}")
    print(f"STEP: {name}")
    print('='*60)
    try:
        func()
        print(f"✅ {name} completed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {name} failed: {e}")
        return False
    except Exception as e:
        print(f"⚠️  {name} warning: {e}")
        return True  # Non-fatal

def step_migrations():
    """Apply database migrations"""
    print("📁 Applying database migrations...")
    
    # Check DATABASE_URL
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("   ⚠️  DATABASE_URL not set — will use Supabase dashboard manually")
        print("   → Open: https://app.supabase.com → SQL Editor")
        print(f"   → Paste contents of: {MIGRATION_FILE}")
        input("   Press Enter when done... ")
        return
    
    # Run via psql
    result = subprocess.run(
        ["psql", db_url, "-f", str(MIGRATION_FILE)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"   ❌ Migration failed:\n{result.stderr[:500]}")
        raise subprocess.CalledProcessError(result.returncode, result.args)
    print("   ✅ Migration applied")

def step_patch_gateway():
    """Patch gateway.js with vendor/inventory routes"""
    print("🔧 Patching gateway.js...")
    
    # Default gateway path
    gateway_path = "/var/www/bridgeai/gateway.js"
    if Path(gateway_path).exists():
        target = gateway_path
    else:
        # Try local dev path
        local_gateway = PROJECT_ROOT / "gateway.js"
        if local_gateway.exists():
            target = str(local_gateway)
        else:
            target = input("Enter path to gateway.js (or press Enter to skip): ").strip()
            if not target:
                print("   ⏭️  Skipping gateway patch")
                return
    
    result = subprocess.run(
        [sys.executable, str(PATCH_SCRIPT), target],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"   ❌ Patch failed:\n{result.stderr[:500]}")
        raise subprocess.CalledProcessError(result.returncode, result.args)
    
    print(f"   ✅ Patched {target}")
    print("   💡 Restart gateway: sudo systemctl restart bridgeai-gateway")

def step_verify():
    """Verify endpoints are up"""
    print("🔍 Verifying API endpoints...")
    
    # Get token from user
    token = os.getenv("BRIDGE_TOKEN")
    if not token:
        print("   ⚠️  BRIDGE_TOKEN not set")
        token = input("   Paste your bridge_token (from localStorage): ").strip()
        if not token:
            print("   ⏭️  Skipping verification")
            return
    
    api_url = os.getenv("BRIDGE_API", "http://127.0.0.1:8080")
    
    result = subprocess.run(
        [sys.executable, str(VERIFY_SCRIPT), "--token", token, "--api", api_url],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"   ⚠️  Verification had issues — check output above")
    else:
        print("   ✅ All endpoints healthy")

def step_seed_data():
    """Seed initial vendor & inventory data"""
    print("🌱 Seeding initial data...")
    
    token = os.getenv("BRIDGE_TOKEN")
    if not token:
        token = input("   Paste your bridge_token: ").strip()
        if not token:
            print("   ⏭️  Skipping data import")
            return
    
    api_url = os.getenv("BRIDGE_API", "http://127.0.0.1:8080")
    
    # Run bulk import
    result = subprocess.run(
        [sys.executable, str(BULK_IMPORT_SCRIPT), 
         "--token", token, "--api", api_url],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"   ⚠️  Import had issues — check output above")
    else:
        print("   ✅ Initial data imported successfully")

def step_final_instructions():
    """Show what's next"""
    print(f"\n{'='*60}")
    print("🎉 SETUP COMPLETE")
    print('='*60)
    print("""
Next steps:

1. Verify in Admin Dashboard:
   → Login to Bridge AI OS as superadmin
   → Navigate to Admin → CRM (or /admin/crm)
   → You should see "Vendor & Inventory Management" widget

2. Check API directly:
   curl http://127.0.0.1:8080/api/vendors \
     -H "Authorization: Bearer $BRIDGE_TOKEN"

3. For Linea on-chain integration:
   - Deploy your ERC-721/ERC-1155 contract to Linea
   - Update vendor_onchain_registry with token_address
   - Run the mint-job worker (see README)

4. Documentation:
   📖 VENDOR_INVENTORY_README.md — Full docs
   📖 linea-auto-add-console.js  — Browser console script
   📖 bulk_add_vendors.py        — CLI tool
   📖 VendorInventoryWidget.jsx  — React component

Troubleshooting:
   🔸 401 errors → Verify bridge_token is valid
   🔸 403 errors → Add your email to SUPERUSERS env var
   🔸 404 errors → gateway.js not patched or not restarted
   🔸 DB errors → Run migrations via Supabase SQL editor
""")

    # Offer to open dashboard
    open_dash = input("Open Admin Dashboard now? (y/n): ").lower().strip()
    if open_dash == 'y':
        webbrowser.open("http://127.0.0.1:8080/admin/crm")

def main():
    parser = argparse.ArgumentParser(description='Bridge AI OS Vendor/Inventory Setup Wizard')
    parser.add_argument('--skip-migrations', action='store_true', help='Skip DB migrations')
    parser.add_argument('--skip-patch', action='store_true', help='Skip gateway.js patch')
    parser.add_argument('--skip-verify', action='store_true', help='Skip verification')
    parser.add_argument('--skip-seed', action='store_true', help='Skip initial data import')
    args = parser.parse_args()

    print("""
╔══════════════════════════════════════════════════════════════╗
║     BRIDGE AI OS — Vendor & Inventory Setup Wizard          ║
╚══════════════════════════════════════════════════════════════╝
This will:
  1. Apply vendor/inventory SQL migration to Supabase
  2. Patch gateway.js with /api/vendors & /api/inventory routes
  3. Verify endpoints are reachable
  4. (Optional) Import 10 vendors + 15 inventory items
    """)

    confirm = input("Continue? (y/n): ").lower().strip()
    if confirm != 'y':
        print("Aborted.")
        sys.exit(0)

    steps_run = 0
    total_steps = 4

    if not args.skip_migrations:
        if run_step("1. Apply Database Migrations", step_migrations):
            steps_run += 1

    if not args.skip_patch:
        if run_step("2. Patch gateway.js", step_patch_gateway):
            steps_run += 1

    if not args.skip_verify:
        if run_step("3. Verify API Endpoints", step_verify):
            steps_run += 1

    if not args.skip_seed:
        if run_step("4. Seed Initial Data", step_seed_data):
            steps_run += 1

    print(f"\n📊 Completed {steps_run}/{total_steps} steps")
    step_final_instructions()

if __name__ == '__main__':
    main()
