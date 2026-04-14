#!/usr/bin/env python3
"""
Backend Test Script for Wooleen Marketplace
Testing database state and cleanup functionality
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com/api"

def test_database_state_and_cleanup():
    """Test current database state and cleanup functionality"""
    print("🔍 TESTING DATABASE STATE AND CLEANUP FUNCTIONALITY")
    print("=" * 60)
    
    try:
        # 1. Check current requests and their statuses
        print("\n1. 📋 CHECKING CURRENT REQUESTS...")
        response = requests.get(f"{BASE_URL}/requests")
        
        if response.status_code == 200:
            requests_data = response.json()
            print(f"✅ GET /api/requests successful")
            print(f"📊 Total requests found: {len(requests_data)}")
            
            # Analyze statuses
            status_counts = {}
            for req in requests_data:
                status = req.get('status', 'UNKNOWN')
                status_counts[status] = status_counts.get(status, 0) + 1
            
            print("\n📈 STATUS BREAKDOWN:")
            for status, count in status_counts.items():
                print(f"   - {status}: {count}")
            
            # Check for specific statuses that cleanup targets
            target_statuses = ['EN_ATTENTE_VALIDATION_ADMIN', 'VALIDEE_PAR_ADMIN', 'ENVOYEE_AUX_PRESTATAIRES']
            target_count = sum(status_counts.get(status, 0) for status in target_statuses)
            print(f"\n🎯 Requests with target statuses for cleanup: {target_count}")
            
        else:
            print(f"❌ GET /api/requests failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        # 2. Check current matches
        print("\n2. 🔗 CHECKING REQUEST MATCHES...")
        # We'll check this indirectly through admin stats
        response = requests.get(f"{BASE_URL}/admin/stats")
        
        if response.status_code == 200:
            stats = response.json()
            print(f"✅ Admin stats retrieved")
            print(f"📊 Total matches: {stats.get('matches', 0)}")
            print(f"📊 Total requests: {stats.get('requests', 0)}")
            print(f"📊 Total leads: {stats.get('leads', 0)}")
        else:
            print(f"❌ GET /api/admin/stats failed: {response.status_code}")
        
        # 3. Run cleanup and see current results
        print("\n3. 🧹 RUNNING CLEANUP TO SEE CURRENT STATE...")
        response = requests.post(f"{BASE_URL}/admin/cleanup-old-data")
        
        if response.status_code == 200:
            cleanup_result = response.json()
            print(f"✅ POST /api/admin/cleanup-old-data successful")
            print(f"📊 CLEANUP RESULTS:")
            
            summary = cleanup_result.get('summary', {})
            print(f"   - Matches deleted: {summary.get('matchesDeleted', 0)}")
            print(f"   - Requests migrated: {summary.get('requestsMigrated', 0)}")
            print(f"   - Leads deleted: {summary.get('leadsDeleted', 0)}")
            
            message = cleanup_result.get('message', '')
            print(f"   - Message: {message}")
            
            # Analyze why cleanup returned 0
            if all(count == 0 for count in summary.values()):
                print("\n🤔 ANALYSIS: Cleanup returned 0 everywhere")
                print("POSSIBLE REASONS:")
                print("   1. No matches with statuses: PAYMENT_PENDING, ACCEPTED, DECLINED")
                print("   2. No requests with statuses: EN_ATTENTE_VALIDATION_ADMIN, VALIDEE_PAR_ADMIN, ENVOYEE_AUX_PRESTATAIRES")
                print("   3. No leads older than 7 days with status 'NEW'")
                print("   4. Data was already cleaned in previous runs")
                
        else:
            print(f"❌ POST /api/admin/cleanup-old-data failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        # 4. Check requests again after cleanup
        print("\n4. 📋 CHECKING REQUESTS AFTER CLEANUP...")
        response = requests.get(f"{BASE_URL}/requests")
        
        if response.status_code == 200:
            requests_data_after = response.json()
            print(f"✅ GET /api/requests after cleanup successful")
            print(f"📊 Total requests after cleanup: {len(requests_data_after)}")
            
            # Analyze statuses after cleanup
            status_counts_after = {}
            for req in requests_data_after:
                status = req.get('status', 'UNKNOWN')
                status_counts_after[status] = status_counts_after.get(status, 0) + 1
            
            print("\n📈 STATUS BREAKDOWN AFTER CLEANUP:")
            for status, count in status_counts_after.items():
                print(f"   - {status}: {count}")
                
        else:
            print(f"❌ GET /api/requests after cleanup failed: {response.status_code}")
        
        print("\n" + "=" * 60)
        print("✅ DATABASE STATE AND CLEANUP TEST COMPLETED")
        return True
        
    except Exception as e:
        print(f"❌ Test failed with exception: {str(e)}")
        return False

def main():
    """Main test function"""
    print("🚀 STARTING BACKEND TESTING")
    print(f"🌐 Base URL: {BASE_URL}")
    print(f"⏰ Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success = test_database_state_and_cleanup()
    
    if success:
        print("\n🎉 ALL TESTS COMPLETED SUCCESSFULLY")
        sys.exit(0)
    else:
        print("\n💥 SOME TESTS FAILED")
        sys.exit(1)

if __name__ == "__main__":
    main()