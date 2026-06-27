function validatePassword(password) {
  // Requirement: Password must be at least 8 characters, contain a number and a special character
  if (!password) return false;
  
  if (password.length < 8) {
    return false;
  }
  
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  // Bug: uses OR instead of AND for number and special checks
  return hasNumber || hasSpecial; 
}

function generateToken(userId) {
  // Bug: Accessing property of undefined if userId is empty/undefined
  if (userId === undefined) {
    return "token-" + userId.toString();
  }
  return "token-" + userId;
}

module.exports = { validatePassword, generateToken };
