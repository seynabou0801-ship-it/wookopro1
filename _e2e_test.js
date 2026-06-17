const { MongoClient } = require('mongodb');
const fs = require('fs');
const envText = fs.readFileSync('/app/.env','utf8');
const env = {};
envText.split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g,''); });
(async () => {
  const c = new MongoClient(env.MONGO_URL); await c.connect();
  const db = c.db(env.DB_NAME || 'wooleen_marketplace');

  // 1. Clean old test data
  console.log('=== STEP 1: Cleanup ===');
  await db.collection('request_matches').deleteMany({});
  await db.collection('service_requests').deleteMany({});
  await db.collection('leads').deleteMany({});
  console.log('Cleaned matches, requests, leads');

  // 2. Force all standard test providers to ACTIVE with active TRIAL subscription
  console.log('\n=== STEP 2: Force providers ACTIVE ===');
  const phones = ['700000101','700000102','700000103','700000104','700000105'];
  for (const p of phones) {
    const user = await db.collection('users').findOneAndUpdate(
      { phone: { $regex: p }, role: 'PROVIDER' },
      { $set: { status: 'ACTIVE' } },
      { returnDocument: 'after' }
    );
    if (user && user.value) {
      const u = user.value;
      // Ensure subscription is TRIAL ACTIVE
      const sub = await db.collection('subscriptions').findOne({ providerId: u.id });
      if (!sub) {
        await db.collection('subscriptions').insertOne({
          id: 'sub_' + u.id,
          providerId: u.id,
          plan: 'BASIC',
          status: 'TRIAL',
          planDetails: { leadsPerDay: 5 },
          leadsReceivedThisMonth: 0,
          createdAt: new Date(),
          trialEndsAt: new Date(Date.now() + 30*24*60*60*1000)
        });
        console.log(`+ Added TRIAL sub for ${p}`);
      } else {
        await db.collection('subscriptions').updateOne(
          { providerId: u.id },
          { $set: { status: 'TRIAL', plan: 'BASIC', planDetails: { leadsPerDay: 5 } } }
        );
        console.log(`= Reset TRIAL sub for ${p}`);
      }
    }
  }

  // 3. Submit a lead via fetch
  console.log('\n=== STEP 3: Submit lead via /api/leads ===');
  const res = await fetch('http://localhost:3000/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceCategory: 'plombier',
      city: 'Dakar',
      phone: '+221788888888',
      description: 'Test E2E dispatch — fuite urgente',
      source: 'e2e_test'
    })
  });
  const data = await res.json();
  console.log('Lead response:', data);

  // 4. Check dispatched matches
  console.log('\n=== STEP 4: Verify matches in DB ===');
  const matches = await db.collection('request_matches').find().toArray();
  console.log(`Found ${matches.length} matches`);
  for (const m of matches) {
    const u = await db.collection('users').findOne({ id: m.providerId });
    const pp = await db.collection('provider_profiles').findOne({ userId: m.providerId });
    console.log(`  → ${pp?.businessName || u?.name} (${u?.phone}) | score=${m.score} | status=${m.status}`);
  }

  // 5. Check request status
  const req = await db.collection('service_requests').findOne({ id: data.requestId });
  console.log(`\nService request status: ${req?.status} dispatchedTo: ${req?.dispatchedTo?.length || 0}`);

  // 6. Login as Mamadou and fetch leads via API
  console.log('\n=== STEP 5: Provider login + fetch matches ===');
  const loginRes = await fetch('http://localhost:3000/api/auth/provider/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+221700000101', password: 'wooleen2025' })
  });
  const loginData = await loginRes.json();
  console.log('Login:', loginData.success, 'user:', loginData.user?.id);

  if (loginData.success) {
    const matchesRes = await fetch(`http://localhost:3000/api/provider/leads?providerId=${loginData.user.id}`);
    const matchesData = await matchesRes.json();
    console.log(`Provider matches retrieved: ${matchesData.leads?.length || 0}`);
    if (matchesData.leads?.length > 0) {
      const m = matchesData.leads[0];
      console.log(`  Lead: ${m.request?.category} - ${m.request?.city} - "${m.request?.description?.substring(0,60)}"`);
      console.log(`  Client phone: ${m.request?.clientPhone}`);
    }
  }

  await c.close();
})();
