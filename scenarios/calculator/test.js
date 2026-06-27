const assert = require('assert');
const { add, divide, calculateAverage } = require('./calculator');

try {
  console.log("Running Calculator tests...");
  
  // Test add
  assert.strictEqual(add(2, 3), 5);
  console.log("✓ Test add passed");

  // Test divide
  assert.strictEqual(divide(6, 2), 3);
  console.log("✓ Test divide passed");

  // Test calculateAverage with numbers
  assert.strictEqual(calculateAverage([1, 2, 3]), 2);
  console.log("✓ Test average passed");

  // Test calculateAverage with empty array (will fail or return NaN)
  // This is the bug that will trigger CI failure!
  console.log("Running empty average test...");
  const result = calculateAverage([]);
  assert.ok(!isNaN(result) && result === 0, "Average of empty array should not be NaN (should return 0)");
  console.log("✓ Test empty average passed");

  console.log("ALL TESTS PASSED!");
  process.exit(0);
} catch (err) {
  console.error("TEST SUITE FAILED:");
  console.error(err.stack);
  process.exit(1);
}
