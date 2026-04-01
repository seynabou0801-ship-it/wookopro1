# Wooko - Test Credentials

## Admin Account
- **Phone:** +221700000001
- **Password:** wooleen2025
- **Access:** http://localhost:3000/secure-wooleen-admin/login

## Provider Account (Moussa Serrurier)
- **Provider ID:** 7fbd3093-e6f3-4755-9b60-c59f0b8a9ff9
- **User ID:** 90bdb538-c960-42e5-9bfc-817a31aca1b5
- **Business Name:** Moussa Serrurier
- **Phone:** (To be verified - need to query users table)
- **Default Password:** wooleen2025
- **Access:** http://localhost:3000/provider/login

## Client Account
- **Phone:** (To be created if needed)
- **Password:** wooleen2025
- **Access:** http://localhost:3000/login

---

## API Testing

### Test Provider Dashboard API
```bash
curl http://localhost:3000/api/provider/dashboard/7fbd3093-e6f3-4755-9b60-c59f0b8a9ff9
```

### Expected Behavior
- **Match with status "SENT":** clientPhone should be `null`
- **Match with status "ACCEPTED":** clientPhone should be visible (e.g., "+33777369462")

---

## Test Results (Latest)
✅ Backend API correctly masks/unmasks clientPhone based on match status
✅ Verified with curl and test page
✅ All accepted matches display the client phone number correctly
