/**
 * Check Sola popup city locations in database
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing environment variables');
}

const client = createClient(url, key);

async function checkSolaLocations() {
  const { data, error } = await client
    .from('events')
    .select('title, address, city, country, tags')
    .eq('source', 'soladay')
    .contains('tags', ['popup-city'])
    .order('title');

  if (error) throw error;

  console.log('Sola popup cities in database:');
  console.log('='.repeat(70));

  const withAddress = data.filter(e => e.address);
  const withoutAddress = data.filter(e => !e.address);

  console.log(`With address: ${withAddress.length}/${data.length}`);
  console.log(`Without address: ${withoutAddress.length}/${data.length}`);
  console.log();

  console.log('Sample popup cities with addresses:');
  withAddress.slice(0, 20).forEach(e => {
    const location = e.address ? e.address.substring(0, 50) : 'null';
    console.log(`  ${e.title.padEnd(25)} → ${location}`);
  });

  if (withoutAddress.length > 0) {
    console.log();
    console.log('Popup cities WITHOUT address:');
    withoutAddress.forEach(e => {
      console.log(`  ${e.title}`);
    });
  }
}

checkSolaLocations().catch(console.error);
