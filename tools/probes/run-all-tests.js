import { spawn } from 'child_process';
import { colors } from './utils.js';

/**
 * Run all probe tests sequentially
 */

function runTest(testFile, testName) {
  return new Promise((resolve, reject) => {
    console.log(`\n${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}Starting: ${testName}${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}${'='.repeat(70)}${colors.reset}\n`);

    const testProcess = spawn('node', [testFile], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`\n${colors.green}✓ ${testName} completed successfully${colors.reset}\n`);
        resolve();
      } else {
        console.log(`\n${colors.red}✗ ${testName} failed with code ${code}${colors.reset}\n`);
        reject(new Error(`${testName} failed`));
      }
    });

    testProcess.on('error', (error) => {
      console.error(`\n${colors.red}✗ ${testName} error: ${error.message}${colors.reset}\n`);
      reject(error);
    });
  });
}

async function runAllTests() {
  const startTime = Date.now();

  console.log(`${colors.cyan}${colors.bright}`);
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                  ║');
  console.log('║           Event Platform Scraping Probe Test Suite              ║');
  console.log('║                                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}\n`);

  const tests = [
    { file: 'tests/luma-probe.js', name: 'Luma.com Probe Tests' },
    { file: 'tests/sola-probe.js', name: 'Sola.day Probe Tests' }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await runTest(test.file, test.name);
      passed++;
    } catch (error) {
      failed++;
      console.error(`${colors.red}Failed to run ${test.name}: ${error.message}${colors.reset}`);
    }
  }

  const duration = Date.now() - startTime;
  const durationSeconds = (duration / 1000).toFixed(2);

  console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}Test Suite Summary${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`Total Duration: ${durationSeconds}s`);
  console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);

  console.log(`${colors.yellow}Results have been saved to the ./results directory${colors.reset}`);
  console.log(`  - luma-probe-results.json`);
  console.log(`  - sola-probe-results.json`);
  console.log(`  - screenshots/\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
