import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function checkCountries() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  const client = createClient(url, key);

  const { data, error } = await client
    .from('events')
    .select('country, city, address')
    .order('country');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  // Get unique countries
  const countries = [...new Set(data.map(row => row.country))].filter(Boolean).sort();

  console.log('Unique countries in database:');
  console.log(JSON.stringify(countries, null, 2));
  console.log(`\nTotal unique countries: ${countries.length}`);
  console.log(`Total events: ${data.length}`);
  console.log(`Events with country: ${data.filter(row => row.country).length}`);
  console.log(`Events without country: ${data.filter(row => !row.country).length}`);

  // Show some sample entries with their full location data
  console.log('\nSample country values with locations:');
  const samples = data.filter(row => row.country).slice(0, 30);
  samples.forEach(row => {
    console.log(`  Country: "${row.country}"`);
    console.log(`    City: ${row.city || 'null'}`);
    console.log(`    Address: ${row.address || 'null'}`);
    console.log('');
  });

  process.exit(0);
}

checkCountries();
