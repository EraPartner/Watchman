import dotenv from 'dotenv';
import RouterService from './services/RouterService.js';

// Load local env
dotenv.config({ path: '.env.local' });

async function run() {
  const bHost = process.env.BERYL_HOST;
  const bPorts = process.env.BERYL_PORTS ? String(process.env.BERYL_PORTS).split(/[ ,]+/).map(p=>Number(p)).filter(Boolean) : [];
  const tHost = process.env.TELENET_HOST;
  const tPorts = process.env.TELENET_PORTS ? String(process.env.TELENET_PORTS).split(/[ ,]+/).map(p=>Number(p)).filter(Boolean) : [];

  const services = [];
  if (bHost) services.push(new RouterService({ name: 'beryl', host: bHost, ports: bPorts, timeout: 3000 }));
  if (tHost) services.push(new RouterService({ name: 'telenet', host: tHost, ports: tPorts, timeout: 3000 }));

  if (services.length === 0) {
    console.error('No router envs configured (BERYL_HOST/TELENET_HOST) in backend/.env.local');
    process.exit(2);
  }

  const results = {};
  for (const s of services) {
    try {
      const h = await s.checkHealth();
      results[s.name] = h;
    } catch (e) {
      results[s.name] = { status: 'offline', error: String(e) };
    }
  }

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
}

run().catch(e => { console.error(e); process.exit(1); });
