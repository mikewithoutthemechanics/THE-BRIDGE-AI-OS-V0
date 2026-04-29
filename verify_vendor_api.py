#!/usr/bin/env python3
"""
Bridge AI OS — Vendor/Inventory API Health Check
Verifies the auto-add endpoints are working correctly
"""

import argparse
import json
import sys
import requests

def test_endpoint(base_url, token, path, method='GET', body=None):
    """Make authenticated API call and return result"""
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    try:
        if method == 'GET':
            r = requests.get(f'{base_url}{path}', headers=headers, timeout=10)
        elif method == 'POST':
            r = requests.post(f'{base_url}{path}', headers=headers, json=body, timeout=10)
        else:
            return {'ok': False, 'error': f'Unsupported method: {method}'}
        
        data = r.json() if r.content else {}
        return {
            'ok': r.ok,
            'status': r.status_code,
            'data': data,
            'error': data.get('error') if not r.ok else None
        }
    except Exception as e:
        return {'ok': False, 'status': 0, 'error': str(e)}

def main():
    parser = argparse.ArgumentParser(description='Verify vendor/inventory API')
    parser.add_argument('--token', required=True, help='Bridge JWT token')
    parser.add_argument('--api', default='http://127.0.0.1:8080', help='API base URL')
    args = parser.parse_args()

    base = args.api.rstrip('/')
    token = args.token

    print("🔍 Bridge AI OS — Vendor/Inventory API Health Check\n")
    print(f"🌐 API: {base}")
    print(f"🔑 Token: {token[:20]}...\n")

    tests = [
        ("GET /api/vendors", 'GET', '/api/vendors', None),
        ("GET /api/inventory", 'GET', '/api/inventory', None),
        ("GET /api/vendors/sync-status", 'GET', '/api/vendors/sync-status', None),
    ]

    all_ok = True
    for name, method, path, body in tests:
        print(f"Testing: {name}")
        result = test_endpoint(base, token, path, method, body)
        if result['ok']:
            print(f"   ✅ HTTP {result['status']}")
            if path == '/api/vendors':
                count = len(result['data'].get('vendors', []))
                print(f"   📊 Vendors in DB: {count}")
            elif path == '/api/inventory':
                count = len(result['data'].get('inventory', []))
                print(f"   📊 Inventory items: {count}")
            elif path == '/api/vendors/sync-status':
                totals = result['data'].get('totals', {})
                print(f"   📈 Vendors: {totals.get('vendors',0)} | "
                      f"Inventory: {totals.get('inventory',0)} | "
                      f"Pending mints: {totals.get('pendingMintJobs',0)} | "
                      f"Failed: {totals.get('failedMintJobs',0)}")
        else:
            print(f"   ❌ HTTP {result['status']} — {result['error']}")
            if result['status'] == 401:
                print("   💡 Check your JWT token (localStorage.getItem('bridge_token'))")
            elif result['status'] == 403:
                print("   💡 Ensure your user is in SUPERUSERS env var")
            all_ok = False
        print()

    if all_ok:
        print("🟢 All endpoints healthy! You're ready to import data.")
        print("💡 Next: run bulk_add_vendors.py or paste linea-auto-add-console.js into browser console")
    else:
        print("🔴 Some endpoints failed. Check errors above.")
        sys.exit(1)

if __name__ == '__main__':
    main()
