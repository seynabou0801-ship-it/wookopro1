#!/usr/bin/env python3
"""
Wooleen Marketplace Backend API Tests
Tests the core MVP functionality including WhatsApp message simulation and AI parsing
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com/api"
VERIFY_TOKEN = "wooleen_verify_token_2025"

def test_endpoint(name, method, url, data=None, expected_status=200, expected_fields=None):
    """Generic test function for API endpoints"""
    print(f"\n=== TESTING: {name} ===")
    print(f"Method: {method}")
    print(f"URL: {url}")
    
    try:
        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            headers = {'Content-Type': 'application/json'} if data else {}
            response = requests.post(url, json=data, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")
            
        print(f"Status: {response.status_code}")
        
        # Check status code
        if response.status_code != expected_status:
            print(f"❌ FAILED: Expected status {expected_status}, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
        # Parse JSON response
        try:
            result = response.json()
            print(f"Response: {json.dumps(result, indent=2, default=str)[:500]}...")
        except:
            result = response.text
            print(f"Response (text): {result}")
            
        # Check expected fields
        if expected_fields and isinstance(result, dict):
            for field in expected_fields:
                if field not in result:
                    print(f"❌ FAILED: Expected field '{field}' not found in response")
                    return False
                    
        print(f"✅ PASSED: {name}")
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"❌ FAILED: Request error - {str(e)}")
        return False
    except Exception as e:
        print(f"❌ FAILED: Unexpected error - {str(e)}")
        return False

def run_backend_tests():
    """Run all backend API tests in the specified order"""
    print("🚀 Starting Wooleen Marketplace Backend API Tests")
    print(f"Base URL: {BASE_URL}")
    print(f"Timestamp: {datetime.now()}")
    
    test_results = []
    
    # 1. Test POST /api/seed - Initialize database
    print("\n" + "="*60)
    print("1. TESTING SEED DATABASE")
    print("="*60)
    result = test_endpoint(
        "Seed Database",
        "POST",
        f"{BASE_URL}/seed",
        expected_fields=["ok", "seededProviders"]
    )
    test_results.append(("Seed Database", result))
    
    if result:
        print("✅ Database seeded successfully")
    else:
        print("❌ Seed failed - this may affect other tests")
    
    # Small delay to ensure data is persisted
    time.sleep(1)
    
    # 2. Test GET /api/admin/stats - Get dashboard statistics
    print("\n" + "="*60)
    print("2. TESTING ADMIN STATS")
    print("="*60)
    result = test_endpoint(
        "Admin Stats",
        "GET", 
        f"{BASE_URL}/admin/stats",
        expected_fields=["providers", "requests", "matches", "activeProviders"]
    )
    test_results.append(("Admin Stats", result))
    
    # 3. Test GET /api/providers - List providers
    print("\n" + "="*60)
    print("3. TESTING PROVIDERS LIST")
    print("="*60)
    result = test_endpoint(
        "Get Providers",
        "GET",
        f"{BASE_URL}/providers"
    )
    test_results.append(("Get Providers", result))
    
    # 4. Test POST /api/simulate/message - CORE MVP TEST
    print("\n" + "="*60)
    print("4. TESTING SIMULATE MESSAGE (CORE MVP)")
    print("="*60)
    
    # Test scenario 1: Plombier urgent à Dakar Ouakam
    print("\n--- Scenario 1: Plombier urgent à Ouakam ---")
    result1 = test_endpoint(
        "Simulate Message - Plombier Ouakam",
        "POST",
        f"{BASE_URL}/simulate/message",
        {
            "from": "+221771234567",
            "text": "J'ai besoin d'un plombier urgent à Ouakam, ma douche fuit"
        },
        expected_fields=["ok", "parsed", "matched"]
    )
    
    # Test scenario 2: Electricien à Pikine  
    print("\n--- Scenario 2: Electricien à Pikine ---")
    result2 = test_endpoint(
        "Simulate Message - Electricien Pikine", 
        "POST",
        f"{BASE_URL}/simulate/message",
        {
            "from": "+221772345678", 
            "text": "Cherche électricien à Pikine pour panne de courant"
        },
        expected_fields=["ok", "parsed", "matched"]
    )
    
    # Test scenario 3: Climatiseur à Thiès
    print("\n--- Scenario 3: Climatiseur à Thiès ---")
    result3 = test_endpoint(
        "Simulate Message - Climatiseur Thiès",
        "POST", 
        f"{BASE_URL}/simulate/message",
        {
            "from": "+221773456789",
            "text": "Mon climatiseur est en panne à Thiès Nord"
        },
        expected_fields=["ok", "parsed", "matched"]
    )
    
    # Test scenario 4: Missing info (should ask for clarification)
    print("\n--- Scenario 4: Missing Information ---")
    result4 = test_endpoint(
        "Simulate Message - Missing Info",
        "POST",
        f"{BASE_URL}/simulate/message", 
        {
            "from": "+221774567890",
            "text": "Bonjour, j'ai besoin d'aide"
        },
        expected_fields=["ok", "parsed"]
    )
    
    simulate_success = all([result1, result2, result3, result4])
    test_results.append(("Simulate Message (Core MVP)", simulate_success))
    
    # 5. Test GET /api/requests - List created requests
    print("\n" + "="*60)
    print("5. TESTING REQUESTS LIST")
    print("="*60)
    result = test_endpoint(
        "Get Requests",
        "GET",
        f"{BASE_URL}/requests"
    )
    test_results.append(("Get Requests", result))
    
    # 6. Test GET /api/whatsapp/messages - View mock messages
    print("\n" + "="*60)
    print("6. TESTING WHATSAPP MESSAGES")
    print("="*60)
    result = test_endpoint(
        "WhatsApp Messages",
        "GET",
        f"{BASE_URL}/whatsapp/messages"
    )
    test_results.append(("WhatsApp Messages", result))
    
    # 7. Test GET /api/webhooks/whatsapp - Webhook verification
    print("\n" + "="*60)
    print("7. TESTING WHATSAPP WEBHOOK VERIFICATION")
    print("="*60)
    webhook_url = f"{BASE_URL}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token={VERIFY_TOKEN}&hub.challenge=test123"
    
    print(f"Testing webhook verification URL: {webhook_url}")
    try:
        response = requests.get(webhook_url)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200 and response.text == "test123":
            print("✅ PASSED: WhatsApp Webhook Verification")
            webhook_result = True
        else:
            print("❌ FAILED: Expected 'test123' response")
            webhook_result = False
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        webhook_result = False
        
    test_results.append(("WhatsApp Webhook Verification", webhook_result))
    
    # 8. Test POST /api/whatsapp/send - Send mock message
    print("\n" + "="*60)
    print("8. TESTING WHATSAPP SEND")
    print("="*60)
    result = test_endpoint(
        "WhatsApp Send",
        "POST",
        f"{BASE_URL}/whatsapp/send",
        {
            "to": "+221770000000",
            "text": "Test message from backend test"
        },
        expected_fields=["messaging_product", "contacts", "messages"]
    )
    test_results.append(("WhatsApp Send", result))
    
    # Summary
    print("\n" + "="*60)
    print("BACKEND TEST SUMMARY")
    print("="*60)
    
    passed = 0
    failed = 0
    
    for test_name, result in test_results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\nTotal: {len(test_results)} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Success rate: {(passed/len(test_results)*100):.1f}%")
    
    if failed == 0:
        print("\n🎉 ALL BACKEND TESTS PASSED!")
        return True
    else:
        print(f"\n⚠️  {failed} tests failed. Please check the output above.")
        return False

if __name__ == "__main__":
    success = run_backend_tests()
    exit(0 if success else 1)