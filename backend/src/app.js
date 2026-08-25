const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    mensaje: "API funcionando correctamente",
  });
});

app.post("/api/usuarios", async (req, res) => {
  try {
    const { nombre, email } = req.body;

    const [resultado] = await pool.query(
      "INSERT INTO usuarios (nombre, email) VALUES (?, ?)",
      [nombre, email]
    );

    res.status(201).json({
      id: resultado.insertId,
      nombre,
      email,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Error al crear usuario",
    });
  }
});
module.exports = app;