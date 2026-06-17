#!/usr/bin/env python3
"""
Backend Testing for Lot 3 — Hardening sécurité auth
Tests rate limiting, login history, and regression tests
"""

import requests
import json
import time
import subprocess

# Configuration
BASE_URL = "https://provider-connect-24.preview.emergentagent.com/api"

# Test credentials (all password: wooleen2025)
ADMIN_PHONE = "+221700000001"
PROVIDER_PHONE = "+221700000030"
PROVIDER_PHONE_2 = "+221700000101"
PASSWORD = "wooleen2025"
WRONG_PASSWORD = "wrongpassword123"

def print_test(test_name):
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print('='*80)

def print_result(success, message):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def clear_all_blocks():
    """Clear all rate limiting blocks"""
    script = """
const { MongoClient } = require('mongodb');
const fs = require('fs');
const envText = fs.readFileSync('/app/.env','utf8');
const env = {};
envText.split('\\n').forEach(l => { const m = l.match(/^([A-Z_]+)\\s*=\\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g,''); });
(async () => {
  const c = new MongoClient(env.MONGO_URL); await c.connect();
  const db = c.db(env.DB_NAME || 'wooleen_marketplace');
  await db.collection('login_attempts').deleteMany({});
  await db.collection('login_history').deleteMany({});
  await c.close();
})();
"""
    with open('/tmp/clear_all.js', 'w') as f:
        f.write(script)
    subprocess.run(['sh', '-c', 'cd /app && NODE_PATH=/app/node_modules node /tmp/clear_all.js'], 
                   capture_output=True, text=True)
    subprocess.run(['rm', '/tmp/clear_all.js'])
    print("🧹 Cleared all login_attempts and login_history")

# ============================================================================
# TEST 1: Rate Limiting on /api/auth/provider/login
# ============================================================================
def test_rate_limiting_provider():
    print_test("TEST 1 — Rate Limiting on /api/auth/provider/login")
    
    clear_all_blocks()
    time.sleep(1)
    
    # Step 1-2: Make 4 failed attempts
    print("\n📝 Step 1-2: Making 4 failed login attempts...")
    for i in range(1, 5):
        response = requests.post(f"{BASE_URL}/auth/provider/login", json={
            "phone": PROVIDER_PHONE,
            "password": WRONG_PASSWORD
        })
        
        if response.status_code == 401:
            data = response.json()
            remaining = data.get('remainingAttempts', 'N/A')
            expected = 5 - i
            if remaining == expected:
                print_result(True, f"Attempt {i}: remainingAttempts={remaining}")
            else:
                print_result(False, f"Attempt {i}: Expected {expected}, got {remaining}")
        else:
            print_result(False, f"Attempt {i}: Expected 401, got {response.status_code}")
        
        time.sleep(0.3)
    
    # Step 3: 5th failed attempt should return 429
    print("\n📝 Step 3: Making 5th failed attempt (should be blocked with 429)...")
    response = requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": PROVIDER_PHONE,
        "password": WRONG_PASSWORD
    })
    
    if response.status_code == 429:
        data = response.json()
        error = data.get('error')
        retry_after = data.get('retryAfterSec')
        blocked_until = data.get('blockedUntil')
        
        if error == 'RATE_LIMITED' and retry_after:
            print_result(True, f"5th attempt blocked: error={error}, retryAfterSec={retry_after}")
        else:
            print_result(False, f"5th attempt: Missing fields (error={error}, retryAfter={retry_after})")
    else:
        print_result(False, f"5th attempt: Expected 429, got {response.status_code}")
    
    # Step 4: 6th attempt with CORRECT password should still be blocked
    print("\n📝 Step 4: Attempting with CORRECT password (should still be blocked)...")
    response = requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": PROVIDER_PHONE,
        "password": PASSWORD
    })
    
    if response.status_code == 429:
        print_result(True, "Correct password still blocked with 429")
    else:
        print_result(False, f"Expected 429, got {response.status_code}")
    
    # Step 5: Clear and verify login works
    print("\n📝 Step 5: Clearing blocks and testing successful login...")
    clear_all_blocks()
    time.sleep(1)
    
    response = requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": PROVIDER_PHONE,
        "password": PASSWORD
    })
    
    if response.status_code == 200:
        data = response.json()
        if data.get('success') and data.get('token'):
            print_result(True, "Login successful after clearing (200 with token)")
        else:
            print_result(False, "Login response missing success or token")
    else:
        print_result(False, f"Expected 200, got {response.status_code}")
    
    # Step 6: Test clearLoginAttempts on success
    print("\n📝 Step 6: Testing clearLoginAttempts() on successful login...")
    clear_all_blocks()
    time.sleep(1)
    
    # 3 failed attempts
    for i in range(3):
        requests.post(f"{BASE_URL}/auth/provider/login", json={
            "phone": PROVIDER_PHONE,
            "password": WRONG_PASSWORD
        })
        time.sleep(0.2)
    
    # 1 correct login
    response = requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": PROVIDER_PHONE,
        "password": PASSWORD
    })
    
    if response.status_code == 200:
        print_result(True, "Correct login after 3 failed attempts succeeded")
        
        # Verify entry was deleted
        check_script = """
const { MongoClient } = require('mongodb');
const fs = require('fs');
const envText = fs.readFileSync('/app/.env','utf8');
const env = {};
envText.split('\\n').forEach(l => { const m = l.match(/^([A-Z_]+)\\s*=\\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g,''); });
(async () => {
  const c = new MongoClient(env.MONGO_URL); await c.connect();
  const db = c.db(env.DB_NAME || 'wooleen_marketplace');
  const count = await db.collection('login_attempts').countDocuments({ phone: '+221700000030' });
  console.log(count);
  await c.close();
})();
"""
        with open('/tmp/check.js', 'w') as f:
            f.write(check_script)
        result = subprocess.run(['sh', '-c', 'cd /app && NODE_PATH=/app/node_modules node /tmp/check.js'], 
                              capture_output=True, text=True)
        count = int(result.stdout.strip()) if result.stdout.strip().isdigit() else -1
        subprocess.run(['rm', '/tmp/check.js'])
        
        if count == 0:
            print_result(True, "clearLoginAttempts() deleted the entry")
        else:
            print_result(False, f"Entry still exists (count={count})")
    else:
        print_result(False, f"Login failed: {response.status_code}")

# ============================================================================
# TEST 2: Rate Limiting on /api/auth/login (admin)
# ============================================================================
def test_rate_limiting_admin():
    print_test("TEST 2 — Rate Limiting on /api/auth/login (admin)")
    
    clear_all_blocks()
    time.sleep(1)
    
    # Make 5 failed attempts
    print("\n📝 Making 5 failed admin login attempts...")
    for i in range(1, 6):
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "phone": ADMIN_PHONE,
            "password": WRONG_PASSWORD
        })
        print(f"  Attempt {i}: Status {response.status_code}")
        time.sleep(0.3)
    
    # Verify blocked
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "phone": ADMIN_PHONE,
        "password": WRONG_PASSWORD
    })
    
    if response.status_code == 429:
        print_result(True, "Admin login blocked with 429 after 5 attempts")
    else:
        print_result(False, f"Expected 429, got {response.status_code}")
    
    # Clear and verify works
    print("\n📝 Clearing and testing correct admin login...")
    clear_all_blocks()
    time.sleep(1)
    
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "phone": ADMIN_PHONE,
        "password": PASSWORD
    })
    
    if response.status_code == 200 and response.json().get('token'):
        print_result(True, "Admin login successful after clearing")
    else:
        print_result(False, f"Admin login failed: {response.status_code}")

# ============================================================================
# TEST 3: Rate limit isolation per role
# ============================================================================
def test_rate_limit_isolation():
    print_test("TEST 3 — Rate limit isolation per role")
    
    clear_all_blocks()
    time.sleep(1)
    
    test_phone = ADMIN_PHONE
    
    print(f"\n📝 Making 5 failed attempts via PROVIDER endpoint for {test_phone}...")
    for i in range(1, 6):
        response = requests.post(f"{BASE_URL}/auth/provider/login", json={
            "phone": test_phone,
            "password": WRONG_PASSWORD
        })
        time.sleep(0.2)
    
    # Verify PROVIDER role is blocked
    response = requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": test_phone,
        "password": PASSWORD
    })
    
    if response.status_code == 429:
        print_result(True, "PROVIDER role blocked with 429")
    else:
        print_result(False, f"PROVIDER not blocked: {response.status_code}")
    
    # Try ADMIN login (should work - different key)
    print(f"\n📝 Trying ADMIN endpoint with correct password (should work)...")
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "phone": test_phone,
        "password": PASSWORD
    })
    
    if response.status_code == 200 and response.json().get('token'):
        print_result(True, "ADMIN login successful (different rate limit key)")
    else:
        print_result(False, f"ADMIN login failed: {response.status_code}")

# ============================================================================
# TEST 4: Login History endpoint
# ============================================================================
def test_login_history():
    print_test("TEST 4 — Login History endpoint")
    
    clear_all_blocks()
    time.sleep(1)
    
    # Step 1: Login successfully
    print("\n📝 Step 1: Login successfully with provider...")
    response = requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": PROVIDER_PHONE,
        "password": PASSWORD
    })
    
    if response.status_code != 200:
        print_result(False, f"Provider login failed: {response.status_code}")
        return
    
    token = response.json().get('token')
    print_result(True, "Provider login successful")
    time.sleep(0.5)
    
    # Step 2: GET login-history with token
    print("\n📝 Step 2: GET /api/auth/login-history with Bearer token...")
    response = requests.get(f"{BASE_URL}/auth/login-history", headers={
        "Authorization": f"Bearer {token}"
    })
    
    if response.status_code == 200:
        history = response.json().get('history', [])
        
        if len(history) >= 1:
            entry = history[0]
            required_fields = ['success', 'phone', 'role', 'userId', 'ip', 'userAgent', 'createdAt']
            missing = [f for f in required_fields if f not in entry]
            
            if not missing and entry.get('success') == True:
                print_result(True, f"Login history has all required fields ({len(history)} entries)")
            else:
                print_result(False, f"Missing fields: {missing}")
        else:
            print_result(False, f"Expected at least 1 entry, got {len(history)}")
    else:
        print_result(False, f"Expected 200, got {response.status_code}")
    
    # Step 3: Without auth → 401
    print("\n📝 Step 3: GET without auth (should return 401)...")
    response = requests.get(f"{BASE_URL}/auth/login-history")
    
    if response.status_code == 401:
        print_result(True, "Correctly returned 401 without auth")
    else:
        print_result(False, f"Expected 401, got {response.status_code}")
    
    # Step 4: With invalid token → 401
    print("\n📝 Step 4: GET with invalid token (should return 401)...")
    response = requests.get(f"{BASE_URL}/auth/login-history", headers={
        "Authorization": "Bearer invalid_token"
    })
    
    if response.status_code == 401:
        print_result(True, "Correctly returned 401 with invalid token")
    else:
        print_result(False, f"Expected 401, got {response.status_code}")
    
    # Step 5: Test with failures
    print("\n📝 Step 5: Testing history with 2 failures + 1 success...")
    clear_all_blocks()
    time.sleep(1)
    
    # 2 failed attempts
    for i in range(2):
        requests.post(f"{BASE_URL}/auth/provider/login", json={
            "phone": PROVIDER_PHONE,
            "password": WRONG_PASSWORD
        })
        time.sleep(0.3)
    
    # 1 success
    response = requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": PROVIDER_PHONE,
        "password": PASSWORD
    })
    
    if response.status_code == 200:
        token = response.json().get('token')
        time.sleep(0.5)
        
        response = requests.get(f"{BASE_URL}/auth/login-history", headers={
            "Authorization": f"Bearer {token}"
        })
        
        if response.status_code == 200:
            history = response.json().get('history', [])
            fail_count = sum(1 for e in history if e.get('success') == False)
            wrong_pwd = sum(1 for e in history if e.get('reason') == 'WRONG_PASSWORD')
            
            if fail_count >= 2 and wrong_pwd >= 2:
                print_result(True, f"History contains failures with WRONG_PASSWORD ({fail_count} fails)")
            else:
                print_result(False, f"Expected ≥2 failures, got {fail_count}")
        else:
            print_result(False, f"Failed to fetch history: {response.status_code}")
    else:
        print_result(False, f"Success login failed: {response.status_code}")

# ============================================================================
# TEST 5: Regression Tests
# ============================================================================
def test_regression():
    print_test("TEST 5 — Regression Tests")
    
    clear_all_blocks()
    time.sleep(1)
    
    tests_passed = 0
    tests_total = 6
    
    # Test 1: POST /api/seed
    print("\n📝 Test 1: POST /api/seed...")
    response = requests.post(f"{BASE_URL}/seed")
    if response.status_code == 200:
        print_result(True, "Seed endpoint works")
        tests_passed += 1
    else:
        print_result(False, f"Seed failed: {response.status_code}")
    
    # Test 2: Admin login
    print("\n📝 Test 2: POST /api/auth/login (admin)...")
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "phone": ADMIN_PHONE,
        "password": PASSWORD
    })
    if response.status_code == 200 and response.json().get('token'):
        admin_token = response.json().get('token')
        print_result(True, "Admin login works")
        tests_passed += 1
    else:
        print_result(False, f"Admin login failed: {response.status_code}")
        admin_token = None
    
    # Test 3: Provider login
    print("\n📝 Test 3: POST /api/auth/provider/login...")
    response = requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": PROVIDER_PHONE,
        "password": PASSWORD
    })
    if response.status_code == 200 and response.json().get('token'):
        provider_token = response.json().get('token')
        print_result(True, "Provider login works")
        tests_passed += 1
    else:
        print_result(False, f"Provider login failed: {response.status_code}")
        provider_token = None
    
    # Test 4: Forgot password
    print("\n📝 Test 4: POST /api/auth/forgot-password...")
    response = requests.post(f"{BASE_URL}/auth/forgot-password", json={
        "phone": PROVIDER_PHONE,
        "role": "PROVIDER"
    })
    if response.status_code == 200:
        print_result(True, "Forgot password works")
        tests_passed += 1
    else:
        print_result(False, f"Forgot password failed: {response.status_code}")
    
    # Test 5: Change password
    if provider_token:
        print("\n📝 Test 5: POST /api/auth/change-password...")
        response = requests.post(f"{BASE_URL}/auth/change-password", 
            headers={"Authorization": f"Bearer {provider_token}"},
            json={
                "currentPassword": PASSWORD,
                "newPassword": "NewPassword2025"
            })
        if response.status_code == 200:
            print_result(True, "Change password works")
            tests_passed += 1
            
            # Restore password
            new_token = response.json().get('token')
            if new_token:
                requests.post(f"{BASE_URL}/auth/change-password",
                    headers={"Authorization": f"Bearer {new_token}"},
                    json={
                        "currentPassword": "NewPassword2025",
                        "newPassword": PASSWORD
                    })
        else:
            print_result(False, f"Change password failed: {response.status_code}")
    else:
        print_result(False, "Skipped (no provider token)")
    
    # Test 6: Admin stats
    if admin_token:
        print("\n📝 Test 6: GET /api/admin/stats...")
        response = requests.get(f"{BASE_URL}/admin/stats", 
            headers={"Authorization": f"Bearer {admin_token}"})
        if response.status_code == 200:
            print_result(True, "Admin stats works")
            tests_passed += 1
        else:
            print_result(False, f"Admin stats failed: {response.status_code}")
    else:
        print_result(False, "Skipped (no admin token)")
    
    print(f"\n📊 Regression tests: {tests_passed}/{tests_total} passed")

# ============================================================================
# TEST 6: Window expiry
# ============================================================================
def test_window_expiry():
    print_test("TEST 6 — Window expiry (inspection)")
    
    clear_all_blocks()
    time.sleep(1)
    
    print("\n📝 Making 1 failed attempt to create entry...")
    requests.post(f"{BASE_URL}/auth/provider/login", json={
        "phone": PROVIDER_PHONE_2,
        "password": WRONG_PASSWORD
    })
    
    time.sleep(0.5)
    
    # Inspect entry
    check_script = """
const { MongoClient } = require('mongodb');
const fs = require('fs');
const envText = fs.readFileSync('/app/.env','utf8');
const env = {};
envText.split('\\n').forEach(l => { const m = l.match(/^([A-Z_]+)\\s*=\\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g,''); });
(async () => {
  const c = new MongoClient(env.MONGO_URL); await c.connect();
  const db = c.db(env.DB_NAME || 'wooleen_marketplace');
  const entry = await db.collection('login_attempts').findOne({ phone: '+221700000101' });
  if (entry) {
    console.log(JSON.stringify({
      count: entry.count,
      hasFirstAttemptAt: !!entry.firstAttemptAt,
      hasLastAttemptAt: !!entry.lastAttemptAt
    }));
  } else {
    console.log('{}');
  }
  await c.close();
})();
"""
    with open('/tmp/check_window.js', 'w') as f:
        f.write(check_script)
    result = subprocess.run(['sh', '-c', 'cd /app && NODE_PATH=/app/node_modules node /tmp/check_window.js'], 
                          capture_output=True, text=True)
    subprocess.run(['rm', '/tmp/check_window.js'])
    
    try:
        data = json.loads(result.stdout.strip())
        if data.get('hasFirstAttemptAt'):
            print_result(True, f"firstAttemptAt is set (count={data.get('count')})")
        else:
            print_result(False, "firstAttemptAt not found")
    except:
        print_result(False, f"Could not parse result: {result.stdout}")

# ============================================================================
# CLEANUP
# ============================================================================
def cleanup():
    print_test("CLEANUP — Restoring test data")
    
    cleanup_script = """
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const envText = fs.readFileSync('/app/.env','utf8');
const env = {};
envText.split('\\n').forEach(l => { const m = l.match(/^([A-Z_]+)\\s*=\\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g,''); });
(async () => {
  const c = new MongoClient(env.MONGO_URL); await c.connect();
  const db = c.db(env.DB_NAME || 'wooleen_marketplace');
  const hash = await bcrypt.hash('wooleen2025', 10);
  const phones = ['700000001','700000030','700000101','700000102','700000103','700000104','700000105'];
  for (const p of phones) {
    await db.collection('users').updateOne({ phone: { $regex: p } }, { $set: { passwordHash: hash, tokenVersion: 0 } });
  }
  await db.collection('login_attempts').deleteMany({});
  await db.collection('admin_notifications').deleteMany({ type: { $in: ['PASSWORD_RESET_REQUEST','PASSWORD_CHANGED'] } });
  console.log('✅ Cleanup complete');
  await c.close();
})();
"""
    with open('/tmp/cleanup.js', 'w') as f:
        f.write(cleanup_script)
    result = subprocess.run(['sh', '-c', 'cd /app && NODE_PATH=/app/node_modules node /tmp/cleanup.js'], 
                          capture_output=True, text=True)
    print(result.stdout.strip())
    subprocess.run(['rm', '/tmp/cleanup.js'])

# ============================================================================
# MAIN
# ============================================================================
if __name__ == "__main__":
    print("\n" + "="*80)
    print("BACKEND TESTING — LOT 3: Hardening sécurité auth")
    print("="*80)
    
    try:
        test_rate_limiting_provider()
        test_rate_limiting_admin()
        test_rate_limit_isolation()
        test_login_history()
        test_regression()
        test_window_expiry()
    finally:
        cleanup()
    
    print("\n" + "="*80)
    print("ALL TESTS COMPLETED")
    print("="*80)
