#!/usr/bin/env python3
"""
Bridge AI OS — Vendor & Inventory Auto-Add CLI
Run: python3 bulk_add_vendors.py --token <bridge_token> --api http://127.0.0.1:8080
"""

import argparse
import json
import sys
import time
from typing import Dict, Any

import requests

# -----------------------------------------------------------------------------
# DATA
# -----------------------------------------------------------------------------
VENDORS = [
    {"name": "WebWay Hosting", "type": "hosting", "contact": "support@webway.host", "currency": "ZAR", "spend_mtd": 0},
    {"name": "Anthropic", "type": "ai-provider", "contact": "api@anthropic.com", "currency": "USD", "spend_mtd": 0},
    {"name": "OpenAI", "type": "ai-provider", "contact": "api@openai.com", "currency": "USD", "spend_mtd": 0},
    {"name": "PayFast", "type": "payment-processor", "contact": "support@payfast.co.za", "currency": "ZAR", "spend_mtd": 0},
    {"name": "Paystack", "type": "payment-processor", "contact": "support@paystack.com", "currency": "ZAR", "spend_mtd": 0},
    {"name": "MetaMask", "type": "wallet-provider", "contact": "support@metamask.io", "currency": "USD", "spend_mtd": 0},
    {"name": "Linea", "type": "blockchain", "contact": "support@linea.build", "currency": "ETH", "spend_mtd": 0},
    {"name": "Supabase", "type": "database", "contact": "support@supabase.io", "currency": "USD", "spend_mtd": 0},
    {"name": "Stripe", "type": "payment-processor", "contact": "support@stripe.com", "currency": "USD", "spend_mtd": 0},
    {"name": "Hugging Face", "type": "ai-provider", "contact": "support@huggingface.co", "currency": "USD", "spend_mtd": 0},
]

INVENTORY = [
    # WebWay Hosting
    {"name": "VPS 4-Core Server", "category": "infrastructure", "sku": "INF-VPS-01", "cost": 0, "currency": "ZAR", "location": "Cloud"},
    {"name": "Dedicated RAM 16GB", "category": "infrastructure", "sku": "INF-RAM-01", "cost": 0, "currency": "ZAR", "location": "Cloud"},
    # Anthropic
    {"name": "Claude API Credits (1M tokens)", "category": "services", "sku": "SRV-AI-01", "cost": 0, "currency": "USD", "location": "Virtual"},
    {"name": "Claude Opus Credits", "category": "services", "sku": "SRV-AI-OPUS", "cost": 0, "currency": "USD", "location": "Virtual"},
    # OpenAI
    {"name": "GPT-4 API Credits", "category": "services", "sku": "SRV-AI-GPT4", "cost": 0, "currency": "USD", "location": "Virtual"},
    {"name": "Whisper Transcription Credits", "category": "services", "sku": "SRV-AI-WHISPER", "cost": 0, "currency": "USD", "location": "Virtual"},
    # PayFast
    {"name": "Payment Processing Credits", "category": "services", "sku": "PAY-CRED-01", "cost": 0, "currency": "ZAR", "location": "Gateway"},
    # Paystack
    {"name": "Payment Processing Credits", "category": "services", "sku": "PAY-CRED-02", "cost": 0, "currency": "ZAR", "location": "Gateway"},
    # MetaMask
    {"name": "Wallet Infrastructure", "category": "services", "sku": "WALLET-001", "cost": 0, "currency": "ETH", "location": "EVM"},
    # Linea
    {"name": "Gas Fee Credits", "category": "crypto", "sku": "CRY-LINEA-01", "cost": 0, "currency": "ETH", "location": "L2"},
    {"name": "BRDG Token Reserve", "category": "crypto", "sku": "CRY-BRDG-01", "cost": 0, "currency": "ETH", "location": "Vault"},
    # Supabase
    {"name": "Database Storage 10GB", "category": "database", "sku": "DB-SUP-01", "cost": 0, "currency": "USD", "location": "Cloud"},
    {"name": "Edge Function Credits", "category": "compute", "sku": "COMP-FUNC-01", "cost": 0, "currency": "USD", "location": "Edge"},
    # Stripe
    {"name": "Stripe Connect Fees", "category": "services", "sku": "PAY-STRIPE-01", "cost": 0, "currency": "USD", "location": "Gateway"},
    # Hugging Face
    {"name": "Inference API Credits", "category": "services", "sku": "SRV-AI-HF", "cost": 0, "currency": "USD", "location": "Virtual"},
]

# -----------------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------------
def vendor_name_to_id_map(vendors):
    return {v['name'].lower(): v['id'] for v in vendors if v.get('id')}

def extract_vendor_name(inventory_name: str) -> str:
    name = inventory_name.lower()
    if 'claude' in name or 'ai api' in name: return 'Anthropic'
    if 'gpt' in name or 'whisper' in name: return 'OpenAI'
    if 'vps' in name or 'ram' in name: return 'WebWay Hosting'
    if 'payment' in name or 'payfast' in name: return 'PayFast'
    if 'paystack' in name: return 'Paystack'
    if 'wallet' in name or 'metamask' in name: return 'MetaMask'
    if 'gas' in name or 'brdg' in name or 'linea' in name: return 'Linea'
    if 'supabase' in name or 'database' in name: return 'Supabase'
    if 'stripe' in name: return 'Stripe'
    if 'hugging' in name or 'inference' in name: return 'Hugging Face'
    return 'Linea'

# -----------------------------------------------------------------------------
# MAIN
# -----------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description='Bulk add vendors & inventory to Bridge AI OS')
    parser.add_argument('--token', required=True, help='Bridge JWT token (from localStorage)')
    parser.add_argument('--api', default='http://127.0.0.1:8080', help='API base URL')
    parser.add_argument('--clear', action='store_true', help='Delete all vendors/inventory first')
    parser.add_argument('--skip-vendors', action='store_true', help='Skip vendor import')
    parser.add_argument('--skip-inventory', action='store_true', help='Skip inventory import')
    args = parser.parse_args()

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {args.token}'
    }

    base = args.api.rstrip('/')

    # 1. Optional clear
    if args.clear:
        print('🧹 Clearing existing data...')
        try:
            r = requests.get(f'{base}/api/vendors', headers=headers)
            if r.ok:
                for v in r.json().get('vendors', []):
                    requests.delete(f'{base}/api/vendors/{v["id"]}', headers=headers)
                    print(f'  ✗ Deleted vendor {v["name"]}')
        except Exception as e:
            print(f'  ⚠️  Clear error: {e}')

    # 2. Import vendors
    vendor_results = []
    if not args.skip_vendors:
        print(f'\n📦 Importing {len(VENDORS)} vendors...')
        for i, v in enumerate(VENDORS, 1):
            try:
                r = requests.post(f'{base}/api/vendors', headers=headers, json=v)
                if r.ok:
                    data = r.json()
                    print(f'  ✅ {v["name"]} → {data["vendor"]["id"][:8]}...')
                    vendor_results.append({**v, 'id': data['vendor']['id']})
                else:
                    print(f'  ❌ {v["name"]}: {r.text[:80]}')
                    vendor_results.append({**v, 'error': r.text[:200]})
            except Exception as e:
                print(f'  ❌ {v["name"]}: {e}')
                vendor_results.append({**v, 'error': str(e)})
            time.sleep(0.1)
    else:
        # Fetch existing vendors
        print('\n🔍 Fetching existing vendors...')
        r = requests.get(f'{base}/api/vendors', headers=headers)
        if r.ok:
            vendor_results = r.json().get('vendors', [])

    # 3. Import inventory
    if not args.skip_inventory:
        vendor_map = vendor_name_to_id_map(vendor_results)
        print(f'\n📦 Importing {len(INVENTORY)} inventory items...')
        success_count = 0
        for item in INVENTORY:
            try:
                vendor_name = extract_vendor_name(item['name'])
                vendor_id = vendor_map.get(vendor_name.lower())
                if not vendor_id:
                    print(f'  ⚠️  Skipping {item["name"]} — vendor "{vendor_name}" not found')
                    continue
                payload = {**item, 'vendor_id': vendor_id}
                r = requests.post(f'{base}/api/inventory', headers=headers, json=payload)
                if r.ok:
                    print(f'  ✅ {item["name"]}')
                    success_count += 1
                else:
                    print(f'  ❌ {item["name"]}: {r.text[:80]}')
            except Exception as e:
                print(f'  ❌ {item["name"]}: {e}')
        print(f'\n📊 Inventory: {success_count}/{len(INVENTORY)} imported')
    else:
        print('\n⏭️  Skipping inventory import')

    # 4. Summary
    vendor_success = sum(1 for v in vendor_results if v.get('success', True) and 'error' not in v)
    print(f'\n📊 Vendor import: {vendor_success}/{len(VENDORS)} successful')
    print(f'\n🟢 Auto-add sequence complete.')
    print(f'💡 Visit: {base}/admin/crm (or Admin → CRM) to verify.')

if __name__ == '__main__':
    main()
