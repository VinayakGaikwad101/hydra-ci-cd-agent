function add(a, b) {
  return a + b;
}

function divide(a, b) {
  if (b === 0) return 0;
  return a / b;
}

function calculateAverage(numbers) {
  // Bug: Can cause division by zero if numbers list is empty (dividing by 0)
  // Let's call our internal helper functions so AST links are established!
  let total = 0;
  for (let i = 0; i < numbers.length; i++) {
    total = add(total, numbers[i]);
  }
  return divide(total, numbers.length);
}

module.exports = { add, divide, calculateAverage };
