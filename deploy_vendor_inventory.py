#!/usr/bin/env python3
"""
Bridge AI OS — Vendor & Inventory Auto-Deploy
This script connects to your existing Bridge AI OS database and applies migrations,
then patches the gateway.js file.
"""

import os
import sys
import asyncio
import aiohttp
from pathlib import Path

# ============================================================================
# CONFIGURATION (auto-detect from environment)
# ============================================================================
PROJECT_ROOT = Path(__file__).parent
GATEWAY_PATHS = [
    "/var/www/bridgeai/gateway.js",
    "/opt/bridgeai/gateway.js",
    "./gateway.js",
    "gateway.js"
]

# Find gateway.js
def find_gateway():
    for path in GATEWAY_PATHS:
        if Path(path).exists():
            print(f"✅ Found gateway.js at: {path}")
            return path
    return None

# ============================================================================
# STEP 1: Apply SQL Migration via Bridge API (if available) or print instructions
# ============================================================================
async def apply_migration_via_api():
    """Try to apply migration through Bridge's internal API"""
    print("\n🔍 Attempting to apply migration via Bridge API...")
    
    # Check if we can reach the admin API
    async with aiohttp.ClientSession() as session:
        try:
            # Try health check
            async with session.get("http://127.0.0.1:7777/health", timeout=5) as resp:
                if resp.status == 200:
                    print("✅ Bridge API is reachable")
                    print("💡 You'll need to apply the SQL migration manually via Supabase dashboard or psql")
                    return False
        except:
            print("⚠️ Bridge API not directly reachable")
    
    print("\n📋 Migration SQL (copy to Supabase SQL Editor):")
    print("="*70)
    sql_path = PROJECT_ROOT / "db" / "migrations" / "004_vendor_inventory_management.sql"
    if sql_path.exists():
        with open(sql_path, 'r') as f:
            content = f.read()
            print(content)
    print("="*70)
    print("\nTo apply:")
    print("1. Open https://app.supabase.com → Your Project → SQL Editor")
    print("2. Paste the above SQL")
    print("3. Click Run")
    return True

# ============================================================================
# STEP 2: Patch gateway.js
# ============================================================================
def patch_gateway(gateway_path):
    print(f"\n🔧 Patching gateway.js at: {gateway_path}")
    
    patch_script = PROJECT_ROOT / "patch_gateway_vendor_inventory_routes.py"
    if not patch_script.exists():
        print("❌ Patch script not found")
        return False
    
    import subprocess
    result = subprocess.run(
        [sys.executable, str(patch_script), gateway_path],
        capture_output=True, text=True
    )
    
    if result.returncode == 0:
        print(result.stdout)
        print("✅ gateway.js patched successfully")
        return True
    else:
        print(f"❌ Patch failed:\n{result.stderr}")
        return False

# ============================================================================
# STEP 3: Restart service
# ============================================================================
def restart_service():
    print("\n🔄 Restarting bridgeai-gateway service...")
    
    # Try systemctl first
    import subprocess
    try:
        subprocess.run(["sudo", "systemctl", "restart", "bridgeai-gateway"], check=True)
        print("✅ Service restarted via systemctl")
        return True
    except:
        try:
            subprocess.run(["pm2", "restart", "gateway"], check=True, shell=True)
            print("✅ Service restarted via PM2")
            return True
        except:
            print("⚠️ Could not auto-restart. Please restart manually:")
            print("   sudo systemctl restart bridgeai-gateway")
            print("   or: pm2 restart gateway")
            return False

# ============================================================================
# STEP 4: Verification
# ============================================================================
async def verify_endpoints():
    print("\n🔍 Verifying endpoints...")
    
    # Need token from user
    token = input("Enter your bridge_token (from browser localStorage): ").strip()
    if not token:
        print("❌ No token provided")
        return False
    
    async with aiohttp.ClientSession() as session:
        headers = {"Authorization": f"Bearer {token}"}
        
        endpoints = [
            ("/api/vendors", "GET"),
            ("/api/inventory", "GET"),
            ("/api/vendors/sync-status", "GET")
        ]
        
        all_ok = True
        for path, method in endpoints:
            try:
                if method == "GET":
                    async with session.get(f"http://127.0.0.1:8080{path}", headers=headers, timeout=10) as resp:
                        data = await resp.json()
                        if resp.status == 200:
                            print(f"  ✅ {path} — OK")
                            if path == "/api/vendors":
                                count = len(data.get("vendors", []))
                                print(f"     Vendors in DB: {count}")
                            elif path == "/api/inventory":
                                count = len(data.get("inventory", []))
                                print(f"     Inventory items: {count}")
                            elif path == "/api/vendors/sync-status":
                                totals = data.get("totals", {})
                                print(f"     Mint jobs pending: {totals.get('pendingMintJobs', 0)}")
                        else:
                            print(f"  ❌ {path} — HTTP {resp.status}: {data.get('error')}")
                            all_ok = False
            except Exception as e:
                print(f"  ❌ {path} — Error: {e}")
                all_ok = False
        
        return all_ok

# ============================================================================
# STEP 5: Seed data
# ============================================================================
def seed_data():
    print("\n🌱 Seeding initial vendor & inventory data...")
    
    token = input("Enter your bridge_token again (or press Enter to skip): ").strip()
    if not token:
        print("⏭️ Skipping data import")
        return
    
    import subprocess
    bulk_script = PROJECT_ROOT / "bulk_add_vendors.py"
    if not bulk_script.exists():
        print("❌ bulk_add_vendors.py not found")
        return
    
    result = subprocess.run(
        [sys.executable, str(bulk_script), "--token", token, "--api", "http://127.0.0.1:8080"],
        capture_output=True, text=True
    )
    
    print(result.stdout)
    if result.returncode == 0:
        print("✅ Data seeding complete")
    else:
        print(f"⚠️ Seeding completed with warnings:\n{result.stderr[:500]}")

# ============================================================================
# MAIN
# ============================================================================
async def main():
    print("""
╔══════════════════════════════════════════════════════════════╗
║          Bridge AI OS — Vendor & Inventory Deploy           ║
╚══════════════════════════════════════════════════════════════╝
""")
    
    # Step 1: Apply migration
    await apply_migration_via_api()
    input("\nPress Enter after you've applied the SQL migration... ")
    
    # Step 2: Find and patch gateway.js
    gateway_path = find_gateway()
    if not gateway_path:
        print("❌ gateway.js not found in expected locations")
        print("   Please manually place it or update GATEWAY_PATHS in this script")
        return
    
    if not patch_gateway(gateway_path):
        print("❌ Patching failed")
        return
    
    # Step 3: Restart service
    restart_service()
    
    # Step 4: Verify
    print("\n⏳ Waiting 5 seconds for service to come up...")
    await asyncio.sleep(5)
    
    if await verify_endpoints():
        print("\n✅ Verification passed")
    else:
        print("\n⚠️ Some endpoints failed — check configuration")
    
    # Step 5: Seed data
    seed_data()
    
    print("\n" + "="*70)
    print("🎉 DEPLOYMENT COMPLETE")
    print("="*70)
    print("""
Next:
1. Verify in Admin → CRM
2. Check /api/vendors returns data
3. Deploy Linea mint worker (see VENDOR_INVENTORY_README.md)
    """)

if __name__ == "__main__":
    asyncio.run(main())
