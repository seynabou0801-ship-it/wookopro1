#!/usr/bin/env python3
"""
Backend Testing Script for Wooleen Lead Capture Endpoint
Tests the new POST /api/leads endpoint and related functionality
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"

def print_test_header(test_name):
    print(f"\n{'='*60}")
    print(f"🧪 TEST: {test_name}")
    print(f"{'='*60}")

def print_result(success, message):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def make_request(method, endpoint, data=None, params=None):
    """Make HTTP request with error handling"""
    url = f"{API_BASE}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method == "PATCH":
            response = requests.patch(url, json=data, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        print(f"📡 {method} {endpoint}")
        print(f"Status: {response.status_code}")
        
        if response.headers.get('content-type', '').startswith('application/json'):
            return response.status_code, response.json()
        else:
            return response.status_code, response.text
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return None, str(e)

def test_seed_database():
    """Ensure database is seeded with providers"""
    print_test_header("Database Seeding")
    
    status_code, response = make_request("POST", "/seed")
    
    if status_code == 200:
        print_result(True, "Database seeded successfully")
        if isinstance(response, dict):
            print(f"   Providers created: {response.get('providersCreated', 'N/A')}")
        return True
    else:
        print_result(False, f"Seeding failed with status {status_code}")
        return False

def test_basic_lead_capture():
    """Test basic lead capture functionality"""
    print_test_header("Basic Lead Capture")
    
    lead_data = {
        "serviceCategory": "plombier",
        "city": "Dakar",
        "phone": "+221771234567",
        "description": "Fuite d'eau dans la cuisine",
        "source": "homepage_form"
    }
    
    status_code, response = make_request("POST", "/leads", lead_data)
    
    if status_code == 200 and isinstance(response, dict):
        if response.get('success') and response.get('leadId') and response.get('requestId'):
            matched_providers = response.get('matchedProviders', 0)
            print_result(True, f"Lead created successfully")
            print(f"   Lead ID: {response.get('leadId')}")
            print(f"   Request ID: {response.get('requestId')}")
            print(f"   Matched Providers: {matched_providers}")
            
            if matched_providers > 0:
                print_result(True, f"Automatic matching worked - {matched_providers} providers matched")
            else:
                print_result(False, "No providers matched - check seeded data")
            
            return True, response
        else:
            print_result(False, f"Invalid response structure: {response}")
            return False, None
    else:
        print_result(False, f"Request failed with status {status_code}: {response}")
        return False, None

def test_different_service_categories():
    """Test lead capture with different service categories"""
    print_test_header("Different Service Categories")
    
    test_cases = [
        {
            "serviceCategory": "electricien",
            "city": "Dakar",
            "phone": "+221771234568",
            "description": "Panne électrique dans le salon",
            "source": "homepage_form"
        },
        {
            "serviceCategory": "climatiseur",
            "city": "Thiès",
            "phone": "+221771234569",
            "description": "Climatiseur ne refroidit plus",
            "source": "homepage_form"
        },
        {
            "serviceCategory": "nettoyage",
            "city": "Dakar",
            "phone": "+221771234570",
            "description": "Nettoyage complet de bureau",
            "source": "homepage_form"
        }
    ]
    
    all_passed = True
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i}: {test_case['serviceCategory']} à {test_case['city']} ---")
        
        status_code, response = make_request("POST", "/leads", test_case)
        
        if status_code == 200 and isinstance(response, dict) and response.get('success'):
            matched_providers = response.get('matchedProviders', 0)
            print_result(True, f"{test_case['serviceCategory']} lead created - {matched_providers} matches")
        else:
            print_result(False, f"Failed to create {test_case['serviceCategory']} lead")
            all_passed = False
    
    return all_passed

def test_optional_description():
    """Test lead capture without description (optional field)"""
    print_test_header("Optional Description Field")
    
    lead_data = {
        "serviceCategory": "plombier",
        "city": "Dakar",
        "phone": "+221771234571",
        "source": "homepage_form"
        # No description field
    }
    
    status_code, response = make_request("POST", "/leads", lead_data)
    
    if status_code == 200 and isinstance(response, dict) and response.get('success'):
        print_result(True, "Lead created successfully without description")
        print(f"   Matched Providers: {response.get('matchedProviders', 0)}")
        return True
    else:
        print_result(False, f"Failed to create lead without description: {response}")
        return False

def test_admin_stats_updated():
    """Test that admin stats now include leads, conversions, and conversion rate"""
    print_test_header("Admin Stats with Lead Metrics")
    
    status_code, response = make_request("GET", "/admin/stats")
    
    if status_code == 200 and isinstance(response, dict):
        required_fields = ['leads', 'conversions', 'conversionRate']
        missing_fields = []
        
        for field in required_fields:
            if field not in response:
                missing_fields.append(field)
        
        if not missing_fields:
            print_result(True, "Admin stats include all new lead metrics")
            print(f"   Leads: {response.get('leads')}")
            print(f"   Conversions: {response.get('conversions')}")
            print(f"   Conversion Rate: {response.get('conversionRate')}%")
            print(f"   Providers: {response.get('providers')}")
            print(f"   Requests: {response.get('requests')}")
            return True
        else:
            print_result(False, f"Missing fields in admin stats: {missing_fields}")
            return False
    else:
        print_result(False, f"Failed to get admin stats: {response}")
        return False

def test_service_requests_created():
    """Verify that service_requests are created when leads are captured"""
    print_test_header("Service Requests Creation")
    
    # Get current requests count
    status_code, initial_response = make_request("GET", "/requests")
    initial_count = 0
    if status_code == 200 and isinstance(initial_response, list):
        initial_count = len(initial_response)
    
    # Create a new lead
    lead_data = {
        "serviceCategory": "menuisier",
        "city": "Dakar",
        "phone": "+221771234572",
        "description": "Réparation de porte d'entrée",
        "source": "homepage_form"
    }
    
    status_code, lead_response = make_request("POST", "/leads", lead_data)
    
    if status_code != 200 or not lead_response.get('success'):
        print_result(False, "Failed to create lead for service request test")
        return False
    
    # Wait a moment for processing
    time.sleep(1)
    
    # Check if service_requests increased
    status_code, final_response = make_request("GET", "/requests")
    
    if status_code == 200 and isinstance(final_response, list):
        final_count = len(final_response)
        if final_count > initial_count:
            print_result(True, f"Service request created - count increased from {initial_count} to {final_count}")
            
            # Find the latest request
            latest_request = None
            for req in final_response:
                if req.get('leadId') == lead_response.get('leadId'):
                    latest_request = req
                    break
            
            if latest_request:
                print(f"   Request ID: {latest_request.get('id')}")
                print(f"   Status: {latest_request.get('status')}")
                print(f"   Service Category: {latest_request.get('serviceCategory')}")
                print(f"   City: {latest_request.get('city')}")
            
            return True
        else:
            print_result(False, f"Service request not created - count remained {final_count}")
            return False
    else:
        print_result(False, "Failed to get service requests")
        return False

def run_all_tests():
    """Run all lead capture tests"""
    print("🚀 Starting Wooleen Lead Capture Endpoint Tests")
    print(f"Base URL: {BASE_URL}")
    print(f"API Base: {API_BASE}")
    print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    test_results = []
    
    # Test 1: Seed database
    result = test_seed_database()
    test_results.append(("Database Seeding", result))
    
    if not result:
        print("\n❌ Cannot proceed without seeded data")
        return
    
    # Test 2: Basic lead capture
    result, _ = test_basic_lead_capture()
    test_results.append(("Basic Lead Capture", result))
    
    # Test 3: Different service categories
    result = test_different_service_categories()
    test_results.append(("Different Service Categories", result))
    
    # Test 4: Optional description
    result = test_optional_description()
    test_results.append(("Optional Description", result))
    
    # Test 5: Admin stats updated
    result = test_admin_stats_updated()
    test_results.append(("Admin Stats Updated", result))
    
    # Test 6: Service requests created
    result = test_service_requests_created()
    test_results.append(("Service Requests Creation", result))
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 TEST SUMMARY")
    print(f"{'='*60}")
    
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
    
    print(f"\nResults: {passed}/{total} tests passed ({(passed/total)*100:.1f}%)")
    
    if passed == total:
        print("🎉 All tests passed! Lead Capture Endpoint is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the details above.")

if __name__ == "__main__":
    run_all_tests()