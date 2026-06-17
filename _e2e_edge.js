const { MongoClient } = require('mongodb');
const fs = require('fs');
const envText = fs.readFileSync('/app/.env','utf8');
const env = {};
envText.split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g,''); });
(async () => {
  const c = new MongoClient(env.MONGO_URL); await c.connect();
  const db = c.db(env.DB_NAME || 'wooleen_marketplace');

  // EDGE 1: Aucun prestataire pour cette catégorie+ville
  console.log('=== EDGE 1: Lead pour catégorie sans prestataire (tapisserie@Saint-Louis) ===');
  let res = await fetch('http://localhost:3000/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceCategory: 'tapisserie', city: 'Saint-Louis', phone: '+221788111111', description: 'Test no match' })
  });
  console.log('Response:', await res.json());

  // EDGE 2: Désactiver Mamadou (status=INACTIVE) puis envoyer un lead plombier
  console.log('\n=== EDGE 2: Prestataire INACTIVE doit être exclu ===');
  const mamadou = await db.collection('users').findOneAndUpdate(
    { phone: { $regex: '700000101' }, role: 'PROVIDER' },
    { $set: { status: 'INACTIVE' } }
  );
  // Need to clear cooldown for him
  await db.collection('request_matches').deleteMany({});

  res = await fetch('http://localhost:3000/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceCategory: 'plombier', city: 'Dakar', phone: '+221788222222', description: 'Test exclude INACTIVE' })
  });
  console.log('Response:', await res.json());

  // EDGE 3: Réactiver et envoyer un lead
  console.log('\n=== EDGE 3: Prestataire réactivé reçoit le lead ===');
  await db.collection('users').updateOne(
    { phone: { $regex: '700000101' }, role: 'PROVIDER' },
    { $set: { status: 'ACTIVE' } }
  );
  await db.collection('request_matches').deleteMany({}); // reset cooldown
  res = await fetch('http://localhost:3000/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceCategory: 'plombier', city: 'Dakar', phone: '+221788333333', description: 'Test réactivé' })
  });
  console.log('Response:', await res.json());

  // EDGE 4: Cooldown - 2e demande immédiate doit exclure le même provider
  console.log('\n=== EDGE 4: Cooldown 15min - 2e demande exclut le même prestataire ===');
  res = await fetch('http://localhost:3000/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceCategory: 'plombier', city: 'Dakar', phone: '+221788444444', description: 'Test cooldown' })
  });
  console.log('Response:', await res.json());

  // EDGE 5: Lead reçu visible dans le dashboard provider
  console.log('\n=== EDGE 5: Provider visualise ses leads ===');
  const loginRes = await fetch('http://localhost:3000/api/auth/provider/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+221700000101', password: 'wooleen2025' })
  });
  const loginData = await loginRes.json();
  const matchesRes = await fetch(`http://localhost:3000/api/provider/leads?providerId=${loginData.user.id}`);
  const matchesData = await matchesRes.json();
  console.log(`Total leads visibles: ${matchesData.leads?.length || 0}`);
  matchesData.leads?.slice(0,3).forEach(m => console.log(`  - ${m.request?.category}@${m.request?.city} | ${m.request?.description?.substring(0,40)} | status=${m.status}`));

  await c.close();
})();
