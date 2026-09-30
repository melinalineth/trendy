const bcrypt = require("bcrypt");

// ERS RF-001: la contraseña se hashea con bcrypt con un factor de costo >= 10.
const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  hashPassword,
  comparePassword,
};
