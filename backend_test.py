#!/usr/bin/env python3
"""
Backend API Testing for Wooleen Password Management (Lot 2)
Tests all password management endpoints with comprehensive scenarios
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com/api"

# Test credentials
ADMIN_PHONE = "+221700000001"
ADMIN_PASSWORD = "wooleen2025"
# Use different providers for different tests to avoid conflicts
PROVIDER_PHONE_FORGOT = "+221700000103"  # For forgot password tests
PROVIDER_PHONE_RESET = "+221700000104"   # For reset password tests  
PROVIDER_PHONE_CHANGE = "+221700000105"  # For change password tests
PROVIDER_PASSWORD = "wooleen2025"

# Colors for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def log_test(test_name):
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST: {test_name}{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")

def log_success(message):
    print(f"{GREEN}✅ {message}{RESET}")

def log_error(message):
    print(f"{RED}❌ {message}{RESET}")

def log_info(message):
    print(f"{YELLOW}ℹ️  {message}{RESET}")

def log_response(response):
    print(f"Status: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Response: {response.text}")

# Test counters
tests_passed = 0
tests_failed = 0

def test_seed_database():
    """Ensure database is seeded with test data"""
    global tests_passed, tests_failed
    log_test("Seed Database")
    
    try:
        response = requests.post(f"{BASE_URL}/seed")
        log_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('ok'):
                log_success("Database seeded successfully")
                tests_passed += 1
                return True
        
        log_error("Failed to seed database")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during seed: {str(e)}")
        tests_failed += 1
        return False

def test_admin_login():
    """Test admin login and return token"""
    global tests_passed, tests_failed
    log_test("Admin Login")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD}
        )
        log_response(response)
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            if token:
                log_success(f"Admin login successful, token: {token[:20]}...")
                tests_passed += 1
                return token
        
        log_error("Admin login failed")
        tests_failed += 1
        return None
    except Exception as e:
        log_error(f"Exception during admin login: {str(e)}")
        tests_failed += 1
        return None

def test_provider_login(phone=None, password=None):
    """Test provider login and return token"""
    global tests_passed, tests_failed
    
    # Use defaults if not provided
    if phone is None:
        phone = PROVIDER_PHONE_CHANGE  # Default to change password provider
    if password is None:
        password = PROVIDER_PASSWORD
    
    log_test(f"Provider Login ({phone})")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/provider/login",
            json={"phone": phone, "password": password}
        )
        log_response(response)
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            if token:
                log_success(f"Provider login successful, token: {token[:20]}...")
                tests_passed += 1
                return token
        
        log_error(f"Provider login failed for {phone}")
        tests_failed += 1
        return None
    except Exception as e:
        log_error(f"Exception during provider login: {str(e)}")
        tests_failed += 1
        return None

def test_forgot_password_valid_provider():
    """Test forgot password with valid provider phone"""
    global tests_passed, tests_failed
    log_test("Forgot Password - Valid Provider")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/forgot-password",
            json={"phone": PROVIDER_PHONE_FORGOT, "role": "PROVIDER"}
        )
        log_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('message'):
                log_success("Forgot password request accepted (generic message)")
                tests_passed += 1
                return True
        
        log_error("Forgot password failed for valid provider")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during forgot password: {str(e)}")
        tests_failed += 1
        return False

def test_forgot_password_unknown_phone():
    """Test forgot password with unknown phone (anti-enumeration)"""
    global tests_passed, tests_failed
    log_test("Forgot Password - Unknown Phone (Anti-Enumeration)")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/forgot-password",
            json={"phone": "+221799999998", "role": "PROVIDER"}
        )
        log_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('message'):
                log_success("Anti-enumeration working: same generic message for unknown phone")
                tests_passed += 1
                return True
        
        log_error("Anti-enumeration failed")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during forgot password: {str(e)}")
        tests_failed += 1
        return False

def test_forgot_password_duplicate():
    """Test duplicate forgot password request"""
    global tests_passed, tests_failed
    log_test("Forgot Password - Duplicate Request")
    
    try:
        # First request
        response1 = requests.post(
            f"{BASE_URL}/auth/forgot-password",
            json={"phone": PROVIDER_PHONE_FORGOT, "role": "PROVIDER"}
        )
        
        # Second request (should indicate already pending)
        response2 = requests.post(
            f"{BASE_URL}/auth/forgot-password",
            json={"phone": PROVIDER_PHONE_FORGOT, "role": "PROVIDER"}
        )
        log_response(response2)
        
        if response2.status_code == 200:
            data = response2.json()
            message = data.get('message', '')
            if 'attente' in message.lower() or 'pending' in message.lower():
                log_success("Duplicate request handled correctly")
                tests_passed += 1
                return True
        
        log_error("Duplicate request not handled properly")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during duplicate forgot password: {str(e)}")
        tests_failed += 1
        return False

def test_forgot_password_missing_phone():
    """Test forgot password without phone"""
    global tests_passed, tests_failed
    log_test("Forgot Password - Missing Phone")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/forgot-password",
            json={"role": "PROVIDER"}
        )
        log_response(response)
        
        if response.status_code == 400:
            log_success("Missing phone validation working")
            tests_passed += 1
            return True
        
        log_error("Missing phone validation failed")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during forgot password: {str(e)}")
        tests_failed += 1
        return False

def get_password_reset_notification(admin_token):
    """Get a PASSWORD_RESET_REQUEST notification"""
    try:
        response = requests.get(
            f"{BASE_URL}/admin/notifications",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            notifications = data.get('notifications', [])
            
            # Find a PENDING PASSWORD_RESET_REQUEST
            for notif in notifications:
                if notif.get('type') == 'PASSWORD_RESET_REQUEST' and notif.get('status') == 'PENDING':
                    return notif
        
        return None
    except Exception as e:
        log_error(f"Exception getting notifications: {str(e)}")
        return None

def test_reset_password_without_auth():
    """Test reset password without authentication"""
    global tests_passed, tests_failed
    log_test("Reset Password - Without Auth")
    
    try:
        response = requests.post(f"{BASE_URL}/admin/notifications/fake-id/reset-password")
        log_response(response)
        
        if response.status_code == 401:
            log_success("Unauthorized access blocked correctly")
            tests_passed += 1
            return True
        
        log_error("Should return 401 without auth")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during reset password: {str(e)}")
        tests_failed += 1
        return False

def test_reset_password_with_provider_auth():
    """Test reset password with provider auth (should fail)"""
    global tests_passed, tests_failed
    log_test("Reset Password - With Provider Auth (Should Fail)")
    
    try:
        provider_token = test_provider_login()
        if not provider_token:
            log_error("Could not get provider token")
            tests_failed += 1
            return False
        
        response = requests.post(
            f"{BASE_URL}/admin/notifications/fake-id/reset-password",
            headers={"Authorization": f"Bearer {provider_token}"}
        )
        log_response(response)
        
        if response.status_code == 401:
            log_success("Provider auth correctly rejected for admin endpoint")
            tests_passed += 1
            return True
        
        log_error("Should return 401 for provider auth")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during reset password: {str(e)}")
        tests_failed += 1
        return False

def test_reset_password_invalid_notification():
    """Test reset password with invalid notification ID"""
    global tests_passed, tests_failed
    log_test("Reset Password - Invalid Notification ID")
    
    try:
        admin_token = test_admin_login()
        if not admin_token:
            log_error("Could not get admin token")
            tests_failed += 1
            return False
        
        response = requests.post(
            f"{BASE_URL}/admin/notifications/invalid-id-12345/reset-password",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        log_response(response)
        
        if response.status_code == 404:
            log_success("Invalid notification ID handled correctly")
            tests_passed += 1
            return True
        
        log_error("Should return 404 for invalid notification ID")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during reset password: {str(e)}")
        tests_failed += 1
        return False

def test_reset_password_valid():
    """Test complete reset password flow"""
    global tests_passed, tests_failed
    log_test("Reset Password - Valid Flow (Complete)")
    
    try:
        # Step 1: Get admin token
        admin_token = test_admin_login()
        if not admin_token:
            log_error("Could not get admin token")
            tests_failed += 1
            return False
        
        # Step 2: Get provider token BEFORE reset (using PROVIDER_PHONE_RESET)
        old_provider_token = test_provider_login(phone=PROVIDER_PHONE_RESET, password=PROVIDER_PASSWORD)
        if not old_provider_token:
            log_error("Could not get provider token before reset")
            tests_failed += 1
            return False
        
        log_info(f"Old provider token: {old_provider_token[:30]}...")
        
        # Step 3: Create forgot password request for PROVIDER_PHONE_RESET
        log_info("Creating forgot password request for reset test provider...")
        forgot_response = requests.post(
            f"{BASE_URL}/auth/forgot-password",
            json={"phone": PROVIDER_PHONE_RESET, "role": "PROVIDER"}
        )
        
        if forgot_response.status_code != 200:
            log_error("Could not create forgot password request")
            tests_failed += 1
            return False
        
        # Step 4: Get the notification for PROVIDER_PHONE_RESET
        log_info("Fetching PASSWORD_RESET_REQUEST notification...")
        notification = get_password_reset_notification(admin_token)
        
        if not notification:
            log_error("Could not find PASSWORD_RESET_REQUEST notification")
            tests_failed += 1
            return False
        
        notif_id = notification.get('id')
        log_info(f"Found notification ID: {notif_id}")
        
        # Step 5: Admin resets password
        log_info("Admin resetting password...")
        reset_response = requests.post(
            f"{BASE_URL}/admin/notifications/{notif_id}/reset-password",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        log_response(reset_response)
        
        if reset_response.status_code != 200:
            log_error("Reset password failed")
            tests_failed += 1
            return False
        
        reset_data = reset_response.json()
        temp_password = reset_data.get('tempPassword')
        
        if not temp_password:
            log_error("No tempPassword in response")
            tests_failed += 1
            return False
        
        log_info(f"Temp password generated: {temp_password}")
        
        # Validate temp password format (8 chars, 1 upper, 1 lower, 1 digit)
        if len(temp_password) != 8:
            log_error(f"Temp password length is {len(temp_password)}, expected 8")
            tests_failed += 1
            return False
        
        if not any(c.isupper() for c in temp_password):
            log_error("Temp password missing uppercase letter")
            tests_failed += 1
            return False
        
        if not any(c.islower() for c in temp_password):
            log_error("Temp password missing lowercase letter")
            tests_failed += 1
            return False
        
        if not any(c.isdigit() for c in temp_password):
            log_error("Temp password missing digit")
            tests_failed += 1
            return False
        
        log_success("Temp password format valid (8 chars, 1 upper, 1 lower, 1 digit)")
        
        # Step 6: Verify notification status changed to SENT
        log_info("Verifying notification status changed to SENT...")
        notif_check = requests.get(
            f"{BASE_URL}/admin/notifications",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        if notif_check.status_code == 200:
            notifications = notif_check.json().get('notifications', [])
            updated_notif = next((n for n in notifications if n.get('id') == notif_id), None)
            
            if updated_notif and updated_notif.get('status') == 'SENT':
                log_success("Notification status updated to SENT")
            else:
                log_error("Notification status not updated to SENT")
                tests_failed += 1
                return False
        
        # Step 7: Login with temp password
        log_info("Testing login with temp password...")
        temp_login_response = requests.post(
            f"{BASE_URL}/auth/provider/login",
            json={"phone": PROVIDER_PHONE_RESET, "password": temp_password}
        )
        
        if temp_login_response.status_code != 200:
            log_error("Could not login with temp password")
            log_response(temp_login_response)
            tests_failed += 1
            return False
        
        new_token = temp_login_response.json().get('token')
        log_success(f"Login with temp password successful, new token: {new_token[:30]}...")
        
        # Step 8: Verify OLD token is invalidated
        log_info("Verifying old token is invalidated...")
        old_token_test = requests.post(
            f"{BASE_URL}/auth/change-password",
            headers={"Authorization": f"Bearer {old_provider_token}"},
            json={"currentPassword": "dummy", "newPassword": "Dummy123"}
        )
        
        if old_token_test.status_code == 401:
            log_success("Old token correctly invalidated")
        else:
            log_error("Old token still valid (should be invalidated)")
            log_response(old_token_test)
            tests_failed += 1
            return False
        
        # Step 9: Restore to a valid password (seed password doesn't meet strength requirements)
        log_info("Restoring to valid password (Wooleen2025)...")
        restore_response = requests.post(
            f"{BASE_URL}/auth/change-password",
            headers={"Authorization": f"Bearer {new_token}"},
            json={"currentPassword": temp_password, "newPassword": "Wooleen2025"}
        )
        
        if restore_response.status_code == 200:
            log_success("Password restored to Wooleen2025 (seed password doesn't meet strength requirements)")
            # Note: Provider password is now Wooleen2025, not wooleen2025
        else:
            log_error("Could not restore password")
            log_response(restore_response)
        
        log_success("✅ COMPLETE RESET PASSWORD FLOW VALIDATED")
        tests_passed += 1
        return True
        
    except Exception as e:
        log_error(f"Exception during reset password flow: {str(e)}")
        tests_failed += 1
        return False

def test_change_password_without_auth():
    """Test change password without authentication"""
    global tests_passed, tests_failed
    log_test("Change Password - Without Auth")
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/change-password",
            json={"currentPassword": "test", "newPassword": "Test1234"}
        )
        log_response(response)
        
        if response.status_code == 401:
            log_success("Unauthorized access blocked correctly")
            tests_passed += 1
            return True
        
        log_error("Should return 401 without auth")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during change password: {str(e)}")
        tests_failed += 1
        return False

def test_change_password_wrong_current():
    """Test change password with wrong current password"""
    global tests_passed, tests_failed
    log_test("Change Password - Wrong Current Password")
    
    try:
        provider_token = test_provider_login(phone=PROVIDER_PHONE_CHANGE, password=PROVIDER_PASSWORD)
        if not provider_token:
            log_error("Could not get provider token")
            tests_failed += 1
            return False
        
        response = requests.post(
            f"{BASE_URL}/auth/change-password",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"currentPassword": "wrongpassword", "newPassword": "NewPass123"}
        )
        log_response(response)
        
        if response.status_code == 401:
            data = response.json()
            if 'incorrect' in data.get('error', '').lower():
                log_success("Wrong current password rejected correctly")
                tests_passed += 1
                return True
        
        log_error("Should return 401 for wrong current password")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during change password: {str(e)}")
        tests_failed += 1
        return False

def test_change_password_same_password():
    """Test change password with same password"""
    global tests_passed, tests_failed
    log_test("Change Password - Same Password")
    
    try:
        provider_token = test_provider_login(phone=PROVIDER_PHONE_CHANGE, password=PROVIDER_PASSWORD)
        if not provider_token:
            log_error("Could not get provider token")
            tests_failed += 1
            return False
        
        response = requests.post(
            f"{BASE_URL}/auth/change-password",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"currentPassword": PROVIDER_PASSWORD, "newPassword": PROVIDER_PASSWORD}
        )
        log_response(response)
        
        if response.status_code == 400:
            data = response.json()
            if 'différent' in data.get('error', '').lower() or 'different' in data.get('error', '').lower():
                log_success("Same password rejected correctly")
                tests_passed += 1
                return True
        
        log_error("Should return 400 for same password")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during change password: {str(e)}")
        tests_failed += 1
        return False

def test_change_password_weak():
    """Test change password with weak password"""
    global tests_passed, tests_failed
    log_test("Change Password - Weak Password")
    
    try:
        provider_token = test_provider_login(phone=PROVIDER_PHONE_CHANGE, password=PROVIDER_PASSWORD)
        if not provider_token:
            log_error("Could not get provider token")
            tests_failed += 1
            return False
        
        response = requests.post(
            f"{BASE_URL}/auth/change-password",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"currentPassword": PROVIDER_PASSWORD, "newPassword": "abc12"}
        )
        log_response(response)
        
        if response.status_code == 400:
            data = response.json()
            error = data.get('error', '')
            if any(word in error.lower() for word in ['caractères', 'majuscule', 'minuscule', 'chiffre']):
                log_success("Weak password rejected with strength error")
                tests_passed += 1
                return True
        
        log_error("Should return 400 for weak password")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during change password: {str(e)}")
        tests_failed += 1
        return False

def test_change_password_valid():
    """Test complete change password flow"""
    global tests_passed, tests_failed
    log_test("Change Password - Valid Flow (Complete)")
    
    try:
        # Step 1: Login and get token (using PROVIDER_PHONE_CHANGE)
        old_token = test_provider_login(phone=PROVIDER_PHONE_CHANGE, password=PROVIDER_PASSWORD)
        if not old_token:
            log_error("Could not get provider token")
            tests_failed += 1
            return False
        
        log_info(f"Old token: {old_token[:30]}...")
        
        # Step 2: Change password
        new_password = "NewSecure123"
        log_info(f"Changing password to: {new_password}")
        
        change_response = requests.post(
            f"{BASE_URL}/auth/change-password",
            headers={"Authorization": f"Bearer {old_token}"},
            json={"currentPassword": PROVIDER_PASSWORD, "newPassword": new_password}
        )
        log_response(change_response)
        
        if change_response.status_code != 200:
            log_error("Change password failed")
            tests_failed += 1
            return False
        
        change_data = change_response.json()
        new_token = change_data.get('token')
        
        if not new_token:
            log_error("No new token in response")
            tests_failed += 1
            return False
        
        log_success(f"Password changed, new token: {new_token[:30]}...")
        
        # Step 3: Verify new token works
        log_info("Testing new token with authenticated endpoint...")
        new_token_test = requests.post(
            f"{BASE_URL}/auth/change-password",
            headers={"Authorization": f"Bearer {new_token}"},
            json={"currentPassword": new_password, "newPassword": "Wooleen2025"}
        )
        
        if new_token_test.status_code == 200:
            log_success("New token works correctly")
            # Get the newest token after this change
            final_token = new_token_test.json().get('token')
        else:
            log_error("New token doesn't work")
            log_response(new_token_test)
            tests_failed += 1
            return False
        
        # Step 4: Verify old token is invalidated
        log_info("Verifying old token is invalidated...")
        old_token_test = requests.post(
            f"{BASE_URL}/auth/change-password",
            headers={"Authorization": f"Bearer {old_token}"},
            json={"currentPassword": "dummy", "newPassword": "Dummy123"}
        )
        
        if old_token_test.status_code == 401:
            log_success("Old token correctly invalidated")
        else:
            log_error("Old token still valid (should be invalidated)")
            log_response(old_token_test)
            tests_failed += 1
            return False
        
        # Step 5: Verify can login with new password
        log_info("Testing login with restored password (Wooleen2025)...")
        login_response = requests.post(
            f"{BASE_URL}/auth/provider/login",
            json={"phone": PROVIDER_PHONE_CHANGE, "password": "Wooleen2025"}
        )
        
        if login_response.status_code == 200:
            log_success("Login with restored password successful")
        else:
            log_error("Could not login with restored password")
            log_response(login_response)
            tests_failed += 1
            return False
        
        # Step 6: Verify PASSWORD_CHANGED notification created
        log_info("Verifying PASSWORD_CHANGED notification created...")
        admin_token = test_admin_login()
        if admin_token:
            notif_response = requests.get(
                f"{BASE_URL}/admin/notifications",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            
            if notif_response.status_code == 200:
                notifications = notif_response.json().get('notifications', [])
                password_changed_notif = next(
                    (n for n in notifications if n.get('type') == 'PASSWORD_CHANGED'),
                    None
                )
                
                if password_changed_notif:
                    log_success("PASSWORD_CHANGED notification created")
                else:
                    log_error("PASSWORD_CHANGED notification not found")
                    tests_failed += 1
                    return False
        
        log_success("✅ COMPLETE CHANGE PASSWORD FLOW VALIDATED")
        tests_passed += 1
        return True
        
    except Exception as e:
        log_error(f"Exception during change password flow: {str(e)}")
        tests_failed += 1
        return False

def test_admin_stats():
    """Test admin stats endpoint (regression)"""
    global tests_passed, tests_failed
    log_test("Admin Stats (Regression)")
    
    try:
        response = requests.get(f"{BASE_URL}/admin/stats")
        log_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if 'providers' in data and 'requests' in data:
                log_success("Admin stats endpoint working")
                tests_passed += 1
                return True
        
        log_error("Admin stats endpoint failed")
        tests_failed += 1
        return False
    except Exception as e:
        log_error(f"Exception during admin stats: {str(e)}")
        tests_failed += 1
        return False

def main():
    """Run all tests"""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}WOOLEEN PASSWORD MANAGEMENT TESTING (LOT 2){RESET}")
    print(f"{BLUE}BASE_URL: {BASE_URL}{RESET}")
    print(f"{BLUE}{'='*80}{RESET}\n")
    
    # Seed database first
    test_seed_database()
    
    # Test 1: Forgot Password Endpoint
    print(f"\n{YELLOW}{'='*80}{RESET}")
    print(f"{YELLOW}SECTION 1: FORGOT PASSWORD ENDPOINT{RESET}")
    print(f"{YELLOW}{'='*80}{RESET}")
    test_forgot_password_valid_provider()
    test_forgot_password_unknown_phone()
    test_forgot_password_duplicate()
    test_forgot_password_missing_phone()
    
    # Test 2: Admin Reset Password Endpoint
    print(f"\n{YELLOW}{'='*80}{RESET}")
    print(f"{YELLOW}SECTION 2: ADMIN RESET PASSWORD ENDPOINT{RESET}")
    print(f"{YELLOW}{'='*80}{RESET}")
    test_reset_password_without_auth()
    test_reset_password_with_provider_auth()
    test_reset_password_invalid_notification()
    test_reset_password_valid()
    
    # Test 3: Change Password Endpoint
    print(f"\n{YELLOW}{'='*80}{RESET}")
    print(f"{YELLOW}SECTION 3: CHANGE PASSWORD ENDPOINT{RESET}")
    print(f"{YELLOW}{'='*80}{RESET}")
    test_change_password_without_auth()
    test_change_password_wrong_current()
    test_change_password_same_password()
    test_change_password_weak()
    test_change_password_valid()
    
    # Test 4: Regression Tests
    print(f"\n{YELLOW}{'='*80}{RESET}")
    print(f"{YELLOW}SECTION 4: REGRESSION TESTS{RESET}")
    print(f"{YELLOW}{'='*80}{RESET}")
    test_admin_login()
    test_provider_login()
    test_admin_stats()
    
    # Summary
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}TEST SUMMARY{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    print(f"{GREEN}Tests Passed: {tests_passed}{RESET}")
    print(f"{RED}Tests Failed: {tests_failed}{RESET}")
    print(f"Total Tests: {tests_passed + tests_failed}")
    
    if tests_failed == 0:
        print(f"\n{GREEN}{'='*80}{RESET}")
        print(f"{GREEN}🎉 ALL TESTS PASSED! 🎉{RESET}")
        print(f"{GREEN}{'='*80}{RESET}\n")
        return 0
    else:
        print(f"\n{RED}{'='*80}{RESET}")
        print(f"{RED}❌ SOME TESTS FAILED{RESET}")
        print(f"{RED}{'='*80}{RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
