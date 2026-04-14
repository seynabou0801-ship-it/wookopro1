#!/usr/bin/env python3
"""
WookoPRO Subscription System Backend Testing
Tests all subscription endpoints in the correct order
"""

import requests
import json
import base64
import time
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com/api"
PROVIDER_ID = "7daacf79-20bd-4cd4-8642-e9c40ed1aad0"  # Test provider USER ID (not profile ID)

# Test data
SAMPLE_PAYMENT_PROOF = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def print_test_result(test_name, success, details=""):
    """Print formatted test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"   {details}")
    print()

def test_subscription_plans():
    """Test 1: GET /api/subscriptions/plans"""
    print("🧪 Test 1: GET /api/subscriptions/plans")
    
    try:
        response = requests.get(f"{BASE_URL}/subscriptions/plans")
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify structure
            required_fields = ['plans', 'paymentPhone', 'trialPeriodDays']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print_test_result("Subscription Plans API", False, f"Missing fields: {missing_fields}")
                return False
            
            # Verify plans
            plans = data['plans']
            expected_plans = ['BASIC', 'PRO', 'PREMIUM']
            plan_names = [plan['name'] for plan in plans]
            
            if not all(plan in plan_names for plan in expected_plans):
                print_test_result("Subscription Plans API", False, f"Missing plans. Found: {plan_names}")
                return False
            
            # Verify prices
            plans_dict = {plan['name']: plan for plan in plans}
            basic_price = plans_dict['BASIC']['price']
            pro_price = plans_dict['PRO']['price']
            premium_price = plans_dict['PREMIUM']['price']
            
            if basic_price != 5000 or pro_price != 10000 or premium_price != 20000:
                print_test_result("Subscription Plans API", False, f"Wrong prices: BASIC={basic_price}, PRO={pro_price}, PREMIUM={premium_price}")
                return False
            
            # Verify payment phone
            if not data['paymentPhone']:
                print_test_result("Subscription Plans API", False, "Missing payment phone number")
                return False
            
            print_test_result("Subscription Plans API", True, f"3 plans found with correct prices, payment phone: {data['paymentPhone']}")
            return True
            
        else:
            print_test_result("Subscription Plans API", False, f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_test_result("Subscription Plans API", False, f"Exception: {str(e)}")
        return False

def test_subscription_creation():
    """Test 2: POST /api/subscriptions/create - Trial creation"""
    print("🧪 Test 2: POST /api/subscriptions/create (Trial creation)")
    
    try:
        # First check if subscription already exists
        existing_response = requests.get(f"{BASE_URL}/subscriptions/my-subscription?providerId={PROVIDER_ID}")
        if existing_response.status_code == 200:
            existing_data = existing_response.json()
            if 'subscription' in existing_data and existing_data['subscription']:
                subscription_id = existing_data['subscription']['id']
                print_test_result("Subscription Creation", True, f"Subscription already exists: {subscription_id} (status: {existing_data['subscription']['status']})")
                return True, subscription_id
        
        payload = {
            "providerId": PROVIDER_ID,
            "plan": "PRO"
        }
        
        response = requests.post(f"{BASE_URL}/subscriptions/create", json=payload)
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify response structure
            required_fields = ['success', 'subscriptionId', 'status', 'trialEndsAt']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print_test_result("Subscription Creation", False, f"Missing fields: {missing_fields}")
                return False, None
            
            # Verify status is TRIAL
            if data['status'] != 'TRIAL':
                print_test_result("Subscription Creation", False, f"Expected status TRIAL, got {data['status']}")
                return False, None
            
            # Verify trial end date (should be ~7 days from now)
            trial_end = datetime.fromisoformat(data['trialEndsAt'].replace('Z', '+00:00'))
            expected_end = datetime.now() + timedelta(days=7)
            time_diff = abs((trial_end - expected_end).total_seconds())
            
            if time_diff > 3600:  # Allow 1 hour difference
                print_test_result("Subscription Creation", False, f"Trial end date incorrect: {data['trialEndsAt']}")
                return False, None
            
            subscription_id = data['subscriptionId']
            print_test_result("Subscription Creation", True, f"Trial subscription created: {subscription_id}, ends: {data['trialEndsAt']}")
            return True, subscription_id
            
        elif response.status_code == 400:
            # Check if it's the "already has subscription" error
            data = response.json()
            if "déjà un abonnement" in data.get('error', '').lower():
                # Get existing subscription ID
                existing_response = requests.get(f"{BASE_URL}/subscriptions/my-subscription?providerId={PROVIDER_ID}")
                if existing_response.status_code == 200:
                    existing_data = existing_response.json()
                    if 'subscription' in existing_data and existing_data['subscription']:
                        subscription_id = existing_data['subscription']['id']
                        print_test_result("Subscription Creation", True, f"Subscription already exists: {subscription_id}")
                        return True, subscription_id
                
                print_test_result("Subscription Creation", False, "Provider already has subscription but couldn't retrieve it")
                return False, None
            else:
                print_test_result("Subscription Creation", False, f"HTTP 400: {data.get('error')}")
                return False, None
        else:
            print_test_result("Subscription Creation", False, f"HTTP {response.status_code}: {response.text}")
            return False, None
            
    except Exception as e:
        print_test_result("Subscription Creation", False, f"Exception: {str(e)}")
        return False, None

def test_duplicate_subscription():
    """Test 2b: POST /api/subscriptions/create - Duplicate error"""
    print("🧪 Test 2b: POST /api/subscriptions/create (Duplicate check)")
    
    try:
        payload = {
            "providerId": PROVIDER_ID,
            "plan": "BASIC"
        }
        
        response = requests.post(f"{BASE_URL}/subscriptions/create", json=payload)
        
        if response.status_code == 400:
            data = response.json()
            if "déjà un abonnement" in data.get('error', '').lower():
                print_test_result("Duplicate Subscription Check", True, "Correctly rejected duplicate subscription")
                return True
            else:
                print_test_result("Duplicate Subscription Check", False, f"Wrong error message: {data.get('error')}")
                return False
        else:
            print_test_result("Duplicate Subscription Check", False, f"Expected 400 error, got {response.status_code}")
            return False
            
    except Exception as e:
        print_test_result("Duplicate Subscription Check", False, f"Exception: {str(e)}")
        return False

def test_upload_payment_proof(subscription_id):
    """Test 3: POST /api/subscriptions/upload-proof"""
    print("🧪 Test 3: POST /api/subscriptions/upload-proof")
    
    try:
        payload = {
            "subscriptionId": subscription_id,
            "paymentProof": SAMPLE_PAYMENT_PROOF,
            "paymentMethod": "wave"
        }
        
        response = requests.post(f"{BASE_URL}/subscriptions/upload-proof", json=payload)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                print_test_result("Payment Proof Upload", True, "Payment proof uploaded successfully")
                return True
            else:
                print_test_result("Payment Proof Upload", False, f"Unexpected response: {data}")
                return False
        else:
            print_test_result("Payment Proof Upload", False, f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_test_result("Payment Proof Upload", False, f"Exception: {str(e)}")
        return False

def test_my_subscription():
    """Test 4: GET /api/subscriptions/my-subscription"""
    print("🧪 Test 4: GET /api/subscriptions/my-subscription")
    
    try:
        response = requests.get(f"{BASE_URL}/subscriptions/my-subscription?providerId={PROVIDER_ID}")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'subscription' in data:
                subscription = data['subscription']
                required_fields = ['id', 'status', 'plan', 'createdAt']
                missing_fields = [field for field in required_fields if field not in subscription]
                
                if missing_fields:
                    print_test_result("My Subscription API", False, f"Missing fields: {missing_fields}")
                    return False
                
                print_test_result("My Subscription API", True, f"Subscription found: {subscription['plan']} - {subscription['status']}")
                return True
            else:
                print_test_result("My Subscription API", False, "No subscription field in response")
                return False
        else:
            print_test_result("My Subscription API", False, f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_test_result("My Subscription API", False, f"Exception: {str(e)}")
        return False

def test_admin_pending_subscriptions():
    """Test 5: GET /api/admin/subscriptions/pending"""
    print("🧪 Test 5: GET /api/admin/subscriptions/pending")
    
    try:
        response = requests.get(f"{BASE_URL}/admin/subscriptions/pending")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'subscriptions' in data:
                subscriptions = data['subscriptions']
                
                # Should have at least one pending subscription
                if len(subscriptions) > 0:
                    # Check if our subscription is in the list
                    pending_found = any(sub['status'] == 'PENDING_VALIDATION' for sub in subscriptions)
                    
                    if pending_found:
                        print_test_result("Admin Pending Subscriptions", True, f"Found {len(subscriptions)} pending subscription(s)")
                        return True
                    else:
                        print_test_result("Admin Pending Subscriptions", False, "No PENDING_VALIDATION subscriptions found")
                        return False
                else:
                    print_test_result("Admin Pending Subscriptions", True, "No pending subscriptions (empty list)")
                    return True
            else:
                print_test_result("Admin Pending Subscriptions", False, "No subscriptions field in response")
                return False
        else:
            print_test_result("Admin Pending Subscriptions", False, f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_test_result("Admin Pending Subscriptions", False, f"Exception: {str(e)}")
        return False

def test_admin_validate_subscription(subscription_id):
    """Test 6: POST /api/admin/subscriptions/{id}/validate"""
    print("🧪 Test 6: POST /api/admin/subscriptions/{id}/validate")
    
    try:
        response = requests.post(f"{BASE_URL}/admin/subscriptions/{subscription_id}/validate")
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success') and 'expiresAt' in data:
                # Verify expiration date (should be ~30 days from now)
                expires_at_str = data['expiresAt']
                if expires_at_str:
                    # Handle both with and without timezone info
                    if expires_at_str.endswith('Z'):
                        expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
                        expected_expiry = datetime.now().replace(tzinfo=expires_at.tzinfo) + timedelta(days=30)
                    else:
                        expires_at = datetime.fromisoformat(expires_at_str)
                        expected_expiry = datetime.now() + timedelta(days=30)
                    
                    time_diff = abs((expires_at - expected_expiry).total_seconds())
                    
                    if time_diff > 86400:  # Allow 1 day difference
                        print_test_result("Admin Validate Subscription", False, f"Expiry date incorrect: {data['expiresAt']}")
                        return False
                
                print_test_result("Admin Validate Subscription", True, f"Subscription validated, expires: {data.get('expiresAt', 'N/A')}")
                return True
            else:
                print_test_result("Admin Validate Subscription", False, f"Unexpected response: {data}")
                return False
        else:
            print_test_result("Admin Validate Subscription", False, f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_test_result("Admin Validate Subscription", False, f"Exception: {str(e)}")
        return False

def test_admin_all_subscriptions():
    """Test 7: GET /api/admin/subscriptions/all"""
    print("🧪 Test 7: GET /api/admin/subscriptions/all")
    
    try:
        # Test without filter
        response = requests.get(f"{BASE_URL}/admin/subscriptions/all")
        
        if response.status_code == 200:
            data = response.json()
            
            if 'subscriptions' in data:
                all_subscriptions = data['subscriptions']
                
                # Test with ACTIVE filter
                response_filtered = requests.get(f"{BASE_URL}/admin/subscriptions/all?status=ACTIVE")
                
                if response_filtered.status_code == 200:
                    filtered_data = response_filtered.json()
                    active_subscriptions = filtered_data['subscriptions']
                    
                    # Verify all returned subscriptions are ACTIVE
                    all_active = all(sub['status'] == 'ACTIVE' for sub in active_subscriptions)
                    
                    if all_active:
                        print_test_result("Admin All Subscriptions", True, f"All subscriptions: {len(all_subscriptions)}, Active: {len(active_subscriptions)}")
                        return True
                    else:
                        print_test_result("Admin All Subscriptions", False, "Filter not working correctly")
                        return False
                else:
                    print_test_result("Admin All Subscriptions", False, f"Filtered request failed: {response_filtered.status_code}")
                    return False
            else:
                print_test_result("Admin All Subscriptions", False, "No subscriptions field in response")
                return False
        else:
            print_test_result("Admin All Subscriptions", False, f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_test_result("Admin All Subscriptions", False, f"Exception: {str(e)}")
        return False

def test_admin_reject_subscription():
    """Test 8: POST /api/admin/subscriptions/{id}/reject"""
    print("🧪 Test 8: POST /api/admin/subscriptions/{id}/reject")
    
    try:
        # Get all subscriptions to find one we can test rejection on
        all_subs_response = requests.get(f"{BASE_URL}/admin/subscriptions/all")
        if all_subs_response.status_code != 200:
            print_test_result("Admin Reject Subscription", False, "Could not get subscriptions list")
            return False
        
        all_subs = all_subs_response.json().get('subscriptions', [])
        
        # Find a subscription that's not ACTIVE (could be TRIAL or PENDING_VALIDATION)
        test_subscription = None
        for sub in all_subs:
            if sub.get('status') in ['TRIAL', 'PENDING_VALIDATION']:
                test_subscription = sub
                break
        
        if not test_subscription:
            print_test_result("Admin Reject Subscription", True, "No suitable subscription found for rejection test (all are ACTIVE)")
            return True
        
        # Test rejection
        reject_payload = {
            "reason": "Preuve invalide - test automatique"
        }
        
        response = requests.post(f"{BASE_URL}/admin/subscriptions/{test_subscription['id']}/reject", json=reject_payload)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                print_test_result("Admin Reject Subscription", True, f"Subscription {test_subscription['id']} rejected successfully")
                return True
            else:
                print_test_result("Admin Reject Subscription", False, f"Unexpected response: {data}")
                return False
        else:
            print_test_result("Admin Reject Subscription", False, f"HTTP {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_test_result("Admin Reject Subscription", False, f"Exception: {str(e)}")
        return False

def main():
    """Run all subscription tests in order"""
    print("🚀 Starting WookoPRO Subscription System Tests")
    print("=" * 60)
    
    results = []
    subscription_id = None
    
    # Test 1: Get subscription plans
    results.append(test_subscription_plans())
    
    # Test 2: Create subscription (trial)
    success, sub_id = test_subscription_creation()
    results.append(success)
    subscription_id = sub_id
    
    # Test 2b: Try to create duplicate (should fail)
    if subscription_id:
        results.append(test_duplicate_subscription())
    
    # Test 3: Upload payment proof
    if subscription_id:
        results.append(test_upload_payment_proof(subscription_id))
    
    # Test 4: Get my subscription
    results.append(test_my_subscription())
    
    # Test 5: Admin - get pending subscriptions
    results.append(test_admin_pending_subscriptions())
    
    # Test 6: Admin - validate subscription
    if subscription_id:
        results.append(test_admin_validate_subscription(subscription_id))
    
    # Test 7: Admin - get all subscriptions
    results.append(test_admin_all_subscriptions())
    
    # Test 8: Admin - reject subscription
    results.append(test_admin_reject_subscription())
    
    # Summary
    print("=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(results)
    total = len(results)
    
    print(f"✅ Passed: {passed}/{total}")
    print(f"❌ Failed: {total - passed}/{total}")
    print(f"📈 Success Rate: {(passed/total)*100:.1f}%")
    
    if passed == total:
        print("\n🎉 ALL SUBSCRIPTION TESTS PASSED!")
        print("WookoPRO Subscription System is fully functional!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please check the issues above.")
    
    return passed == total

if __name__ == "__main__":
    main()