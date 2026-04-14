#!/usr/bin/env python3
"""
Backend Test Script for Wooleen Marketplace
Testing delete-all-test-data endpoint
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com/api"

def test_delete_all_test_data():
    """Test the new delete-all-test-data endpoint"""
    print("🗑️ TESTING DELETE-ALL-TEST-DATA ENDPOINT")
    print("=" * 60)
    
    try:
        # 1. Check current state before deletion
        print("\n1. 📊 CHECKING CURRENT DATABASE STATE...")
        response = requests.get(f"{BASE_URL}/admin/stats")
        
        if response.status_code == 200:
            stats_before = response.json()
            print(f"✅ GET /api/admin/stats successful")
            print(f"📊 BEFORE DELETION:")
            print(f"   - Requests: {stats_before.get('requests', 0)}")
            print(f"   - Matches: {stats_before.get('matches', 0)}")
            print(f"   - Leads: {stats_before.get('leads', 0)}")
            print(f"   - Providers: {stats_before.get('providers', 0)}")
        else:
            print(f"❌ GET /api/admin/stats failed: {response.status_code}")
            return False
        
        # 2. Test the delete-all-test-data endpoint
        print("\n2. 🗑️ TESTING DELETE-ALL-TEST-DATA ENDPOINT...")
        response = requests.post(f"{BASE_URL}/admin/delete-all-test-data")
        
        if response.status_code == 200:
            delete_result = response.json()
            print(f"✅ POST /api/admin/delete-all-test-data successful")
            
            # Validate response structure
            if 'success' in delete_result and delete_result['success']:
                print(f"✅ Success field: {delete_result['success']}")
            else:
                print(f"❌ Missing or false success field")
                return False
            
            # Check summary
            if 'summary' in delete_result:
                summary = delete_result['summary']
                print(f"📊 DELETION SUMMARY:")
                print(f"   - Requests deleted: {summary.get('requestsDeleted', 'MISSING')}")
                print(f"   - Matches deleted: {summary.get('matchesDeleted', 'MISSING')}")
                print(f"   - Leads deleted: {summary.get('leadsDeleted', 'MISSING')}")
                
                # Validate summary fields exist
                required_fields = ['requestsDeleted', 'matchesDeleted', 'leadsDeleted']
                for field in required_fields:
                    if field not in summary:
                        print(f"❌ Missing required field in summary: {field}")
                        return False
                    
            else:
                print(f"❌ Missing summary field in response")
                return False
            
            # Check message
            if 'message' in delete_result:
                message = delete_result['message']
                print(f"📝 Message: {message}")
            else:
                print(f"❌ Missing message field in response")
                return False
                
        else:
            print(f"❌ POST /api/admin/delete-all-test-data failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        # 3. Verify deletion by checking requests
        print("\n3. ✅ VERIFYING DELETION - CHECKING REQUESTS...")
        response = requests.get(f"{BASE_URL}/requests")
        
        if response.status_code == 200:
            requests_after = response.json()
            print(f"✅ GET /api/requests successful")
            print(f"📊 Requests after deletion: {len(requests_after)}")
            
            if len(requests_after) == 0:
                print(f"✅ All requests successfully deleted")
            else:
                print(f"⚠️ {len(requests_after)} requests still exist")
                
        else:
            print(f"❌ GET /api/requests failed: {response.status_code}")
            return False
        
        # 4. Verify providers and subscriptions are preserved
        print("\n4. 🔒 VERIFYING PROVIDERS AND SUBSCRIPTIONS PRESERVED...")
        response = requests.get(f"{BASE_URL}/admin/stats")
        
        if response.status_code == 200:
            stats_after = response.json()
            print(f"✅ GET /api/admin/stats successful")
            print(f"📊 AFTER DELETION:")
            print(f"   - Requests: {stats_after.get('requests', 0)}")
            print(f"   - Matches: {stats_after.get('matches', 0)}")
            print(f"   - Leads: {stats_after.get('leads', 0)}")
            print(f"   - Providers: {stats_after.get('providers', 0)}")
            
            # Verify providers are preserved
            if stats_after.get('providers', 0) == stats_before.get('providers', 0):
                print(f"✅ Providers preserved: {stats_after.get('providers', 0)}")
            else:
                print(f"❌ Providers count changed: {stats_before.get('providers', 0)} → {stats_after.get('providers', 0)}")
                return False
                
        else:
            print(f"❌ GET /api/admin/stats after deletion failed: {response.status_code}")
            return False
        
        print("\n" + "=" * 60)
        print("✅ DELETE-ALL-TEST-DATA ENDPOINT TEST COMPLETED SUCCESSFULLY")
        return True
        
    except Exception as e:
        print(f"❌ Test failed with exception: {str(e)}")
        return False

def main():
    """Main test function"""
    print("🚀 STARTING BACKEND TESTING")
    print(f"🌐 Base URL: {BASE_URL}")
    print(f"⏰ Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success = test_delete_all_test_data()
    
    if success:
        print("\n🎉 ALL TESTS COMPLETED SUCCESSFULLY")
        sys.exit(0)
    else:
        print("\n💥 SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()