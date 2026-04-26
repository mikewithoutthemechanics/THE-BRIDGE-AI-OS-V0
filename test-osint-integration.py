#!/usr/bin/env python3
"""
Test script for OSINT stack integration
"""

import asyncio
import aiohttp
import json
import sys

async def test_osint_endpoints():
    """Test OSINT endpoints functionality"""

    base_url = "http://localhost:8080"

    print("Testing OSINT Stack Integration")
    print("=" * 40)

    async with aiohttp.ClientSession() as session:
        try:
            # Test health endpoint
            print("1. Testing health endpoint...")
            async with session.get(f"{base_url}/health") as response:
                if response.status == 200:
                    print("   ✓ Health check passed")
                else:
                    print(f"   ✗ Health check failed: {response.status}")

            # Test OSINT config endpoint
            print("2. Testing OSINT config endpoint...")
            async with session.get(f"{base_url}/api/v1/osint/config") as response:
                if response.status == 200:
                    data = await response.json()
                    print("   ✓ OSINT config retrieved")
                    print(f"   - Demo mode: {data.get('demo_mode')}")
                    print(f"   - Supported scan types: {data.get('supported_scan_types')}")
                else:
                    print(f"   ✗ OSINT config failed: {response.status}")

            # Test consent request
            print("3. Testing consent request...")
            consent_data = {
                "subject_id": "test-subject-001",
                "purpose": "osint_collection",
                "consent_scope": {
                    "scope": ["social_media", "public_records"],
                    "retention_days": 90
                }
            }

            async with session.post(
                f"{base_url}/api/v1/consent/request",
                json=consent_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    consent_id = data.get("consent_id")
                    print(f"   ✓ Consent requested: {consent_id}")

                    # Test consent retrieval
                    print("4. Testing consent retrieval...")
                    async with session.get(f"{base_url}/api/v1/consent/{consent_id}") as response:
                        if response.status == 200:
                            data = await response.json()
                            print(f"   ✓ Consent retrieved: {data.get('status')}")
                        else:
                            print(f"   ✗ Consent retrieval failed: {response.status}")

                    # Test consent approval
                    print("5. Testing consent approval...")
                    async with session.post(
                        f"{base_url}/api/v1/consent/{consent_id}/approve",
                        json={"approved_by": "test-system"},
                        headers={"Content-Type": "application/json"}
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            print(f"   ✓ Consent approved: {data.get('status')}")
                        else:
                            print(f"   ✗ Consent approval failed: {response.status}")

                else:
                    print(f"   ✗ Consent request failed: {response.status}")

            # Test OSINT scan
            print("6. Testing OSINT scan...")
            scan_data = {
                "subject_id": "test-subject-001",
                "scan_type": "basic",
                "scan_params": {}
            }

            async with session.post(
                f"{base_url}/api/v1/osint/scan",
                json=scan_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    scan_id = data.get("scan_id")
                    print(f"   ✓ OSINT scan started: {scan_id}")

                    # Wait a bit for processing
                    await asyncio.sleep(3)

                    # Test scan status
                    print("7. Testing scan status...")
                    async with session.get(f"{base_url}/api/v1/osint/scan/{scan_id}") as response:
                        if response.status == 200:
                            data = await response.json()
                            print(f"   ✓ Scan status: {data.get('status')}")
                            if data.get('results'):
                                print(f"   ✓ Scan results: {len(data.get('results', []))} findings")
                        else:
                            print(f"   ✗ Scan status failed: {response.status}")

                else:
                    print(f"   ✗ OSINT scan failed: {response.status}")

            # Test findings endpoint
            print("8. Testing OSINT findings...")
            async with session.get(f"{base_url}/api/v1/osint/findings") as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"   ✓ Findings retrieved: {data.get('total_count', 0)} total")
                else:
                    print(f"   ✗ Findings retrieval failed: {response.status}")

            print("\n" + "=" * 40)
            print("OSINT Stack Integration Test Complete!")

        except aiohttp.ClientConnectorError:
            print("❌ Could not connect to backend service. Make sure it's running on http://localhost:8080")
            print("Run: docker-compose up backend")
            return False
        except Exception as e:
            print(f"❌ Test failed with error: {e}")
            return False

    return True

if __name__ == "__main__":
    success = asyncio.run(test_osint_endpoints())
    sys.exit(0 if success else 1)