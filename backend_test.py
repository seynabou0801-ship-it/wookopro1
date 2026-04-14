#!/usr/bin/env python3
"""
Backend Test Suite for Wooleen Marketplace
Testing the cleanup endpoint as requested
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

def test_cleanup_endpoint():
    """Test the admin cleanup endpoint"""
    print("🧹 Testing Admin Cleanup Endpoint")
    print("=" * 50)
    
    try:
        # Test POST /api/admin/cleanup-old-data
        url = f"{API_BASE}/admin/cleanup-old-data"
        print(f"📡 Testing: POST {url}")
        
        response = requests.post(url, timeout=30)
        
        print(f"📊 Status Code: {response.status_code}")
        print(f"📋 Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response JSON: {json.dumps(data, indent=2)}")
            
            # Validate expected response structure
            if 'success' in data and data['success']:
                print("✅ SUCCESS: Cleanup endpoint working correctly")
                
                # Check for expected fields
                if 'summary' in data:
                    summary = data['summary']
                    print(f"📈 Cleanup Summary:")
                    print(f"   - Matches deleted: {summary.get('matchesDeleted', 'N/A')}")
                    print(f"   - Requests migrated: {summary.get('requestsMigrated', 'N/A')}")
                    print(f"   - Leads deleted: {summary.get('leadsDeleted', 'N/A')}")
                    
                    # Validate that all expected fields are present
                    expected_fields = ['matchesDeleted', 'requestsMigrated', 'leadsDeleted']
                    missing_fields = [field for field in expected_fields if field not in summary]
                    
                    if missing_fields:
                        print(f"⚠️ WARNING: Missing fields in summary: {missing_fields}")
                        return False
                    else:
                        print("✅ All expected summary fields present")
                        
                if 'message' in data:
                    print(f"💬 Message: {data['message']}")
                    
                return True
            else:
                print(f"❌ FAILED: Response indicates failure: {data}")
                return False
                
        else:
            print(f"❌ FAILED: HTTP {response.status_code}")
            try:
                error_data = response.json()
                print(f"📋 Error Response: {json.dumps(error_data, indent=2)}")
            except:
                print(f"📋 Raw Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ NETWORK ERROR: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ JSON DECODE ERROR: {e}")
        print(f"📋 Raw Response: {response.text}")
        return False
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {e}")
        return False

def main():
    """Main test runner"""
    print("🚀 Starting Backend Test Suite")
    print(f"🌐 Base URL: {BASE_URL}")
    print(f"📅 Test Time: {datetime.now().isoformat()}")
    print()
    
    # Test the cleanup endpoint
    success = test_cleanup_endpoint()
    
    print()
    print("=" * 50)
    if success:
        print("🎉 CLEANUP ENDPOINT TEST PASSED")
        print("✅ The endpoint works correctly and returns expected response structure")
    else:
        print("💥 CLEANUP ENDPOINT TEST FAILED")
        print("❌ The endpoint did not work as expected")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())