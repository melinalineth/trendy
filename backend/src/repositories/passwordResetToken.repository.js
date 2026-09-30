const prisma = require("../config/prisma");

async function crear({ usuarioId, token, expiraEn }) {
  return prisma.passwordResetToken.create({
    data: { usuarioId, token, expiraEn },
  });
}

async function buscarPorToken(token) {
  return prisma.passwordResetToken.findUnique({
    where: { token },
  });
}

async function marcarUsado(id) {
  return prisma.passwordResetToken.update({
    where: { id },
    data: { usado: true },
  });
}

module.exports = {
  crear,
  buscarPorToken,
  marcarUsado,
};
