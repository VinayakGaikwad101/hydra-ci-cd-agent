const assert = require('assert');
const { validatePassword, generateToken } = require('./auth');

try {
  console.log("Running Auth tests...");
  
  // Test valid password
  assert.strictEqual(validatePassword("Pass123!"), true);
  console.log("✓ Test valid password passed");

  // Test invalid password (too short)
  assert.strictEqual(validatePassword("P1!"), false);
  console.log("✓ Test invalid password passed");

  // Test generateToken normal
  assert.strictEqual(generateToken("123"), "token-123");
  console.log("✓ Test token generation passed");

  // Test generateToken with undefined (should fail due to userId.toString() crash)
  console.log("Running undefined user token test...");
  const token = generateToken(undefined);
  assert.strictEqual(token, "token-undefined");
  console.log("✓ Test undefined user passed");

  console.log("ALL TESTS PASSED!");
  process.exit(0);
} catch (err) {
  console.error("TEST SUITE FAILED:");
  console.error(err.stack);
  process.exit(1);
}
