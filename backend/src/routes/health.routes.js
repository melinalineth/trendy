const { Router } = require("express");
const healthController = require("../controllers/health.controller");

const router = Router();

// Healthcheck del despliegue (Docker Compose / balanceadores): público, sin
// auth ni roleGuard. 200 { estado: "ok" } si la base contesta; 503 si no.
router.get("/api/v1/health", healthController.consultar);

module.exports = router;
