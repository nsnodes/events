import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await client.from('events').select('source, country, created_at');

const badCountries = ['Conference room 2 (in the alleyway next to the lift)', 'karaoke room 1', 'Big room at the end next to ping pong room'];

const bySource = {};
data.forEach(e => {
  if (!bySource[e.source]) bySource[e.source] = { total: 0, bad: 0, badExamples: [] };
  bySource[e.source].total++;
  if (badCountries.includes(e.country)) {
    bySource[e.source].bad++;
    bySource[e.source].badExamples.push({ country: e.country, created: e.created_at });
  }
});

console.log('Events by source:');
Object.entries(bySource).forEach(([source, counts]) => {
  console.log(`  ${source}: ${counts.total} events, ${counts.bad} with bad countries`);
  if (counts.bad > 0) {
    console.log(`    Created at: ${counts.badExamples[0].created}`);
  }
});
