// Seed de roles base del sistema (DDS §3, matriz de roles y permisos de la
// ERS §4.1: administrador, vendedor, cliente). Sin esto, RF-001 (registro)
// falla por la FK de Usuario.rolId — ver comentario en
// src/repositories/rol.repository.js.
//
// Uso: npx prisma db seed (requiere DATABASE_URL apuntando a una base viva).

const prisma = require("../src/config/prisma");

const ROLES = ["cliente", "vendedor", "admin"];

async function main() {
  for (const nombre of ROLES) {
    const rol = await prisma.rol.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    console.log(`Rol listo: ${rol.nombre} (id=${rol.id})`);
  }
}

main()
  .catch((error) => {
    console.error("Error al correr el seed de roles:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const categorias = [
  "Mujer",
  "Hombre",
  "Jeans",
  "Camisetas",
  "Vestidos",
  "Chaquetas",
];

const productos = [
  {
    nombre: "Chaqueta Denim",
    descripcion:
      "Chaqueta de mezclilla clásica, versátil y cómoda para diferentes ocasiones.",
    precio: 89900,
    categoria: "Chaquetas",
    imagen:
      "https://images.unsplash.com/photo-1543076447-215ad9ba6923?w=800",
    variantes: [
      { talla: "S", color: "Azul", stock: 10 },
      { talla: "M", color: "Azul", stock: 8 },
      { talla: "L", color: "Azul", stock: 7 },
    ],
  },
  {
    nombre: "Jean Clásico",
    descripcion:
      "Jean clásico de corte cómodo, ideal para combinar con diferentes prendas.",
    precio: 79900,
    categoria: "Jeans",
    imagen:
      "https://images.unsplash.com/photo-1542272604-787c3835535d?w=800",
    variantes: [
      { talla: "30", color: "Azul", stock: 8 },
      { talla: "32", color: "Azul", stock: 12 },
      { talla: "34", color: "Azul", stock: 10 },
    ],
  },
  {
    nombre: "Camiseta Básica",
    descripcion:
      "Camiseta básica de diseño sencillo para uso diario.",
    precio: 39900,
    categoria: "Camisetas",
    imagen:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
    variantes: [
      { talla: "S", color: "Negro", stock: 20 },
      { talla: "M", color: "Negro", stock: 18 },
      { talla: "L", color: "Negro", stock: 12 },
    ],
  },
  {
    nombre: "Vestido Rosa",
    descripcion:
      "Vestido femenino en tono rosa, diseñado para un estilo moderno y casual.",
    precio: 69900,
    categoria: "Vestidos",
    imagen:
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800",
    variantes: [
      { talla: "S", color: "Rosa", stock: 5 },
      { talla: "M", color: "Rosa", stock: 7 },
      { talla: "L", color: "Rosa", stock: 3 },
    ],
  },
  {
    nombre: "Blusa Casual",
    descripcion:
      "Blusa ligera para complementar diferentes estilos de vestuario.",
    precio: 54900,
    categoria: "Mujer",
    imagen:
      "https://images.unsplash.com/photo-1564257577054-5e6e8c2b5e4f?w=800",
    variantes: [
      { talla: "S", color: "Blanco", stock: 8 },
      { talla: "M", color: "Blanco", stock: 10 },
      { talla: "L", color: "Blanco", stock: 6 },
    ],
  },
  {
    nombre: "Camisa Oxford",
    descripcion:
      "Camisa de estilo clásico para ocasiones casuales y formales.",
    precio: 74900,
    categoria: "Hombre",
    imagen:
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800",
    variantes: [
      { talla: "M", color: "Blanco", stock: 8 },
      { talla: "L", color: "Blanco", stock: 7 },
      { talla: "XL", color: "Blanco", stock: 5 },
    ],
  },
  {
    nombre: "Jean Skinny",
    descripcion:
      "Jean de corte ajustado con diseño moderno y cómodo.",
    precio: 84900,
    categoria: "Jeans",
    imagen:
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800",
    variantes: [
      { talla: "28", color: "Azul", stock: 6 },
      { talla: "30", color: "Azul", stock: 8 },
      { talla: "32", color: "Azul", stock: 9 },
    ],
  },
  {
    nombre: "Camiseta Polo",
    descripcion:
      "Camiseta tipo polo de estilo clásico para uso diario.",
    precio: 59900,
    categoria: "Camisetas",
    imagen:
      "https://images.unsplash.com/photo-1625910513413-5fc45c5d8d3d?w=800",
    variantes: [
      { talla: "M", color: "Azul", stock: 10 },
      { talla: "L", color: "Azul", stock: 8 },
      { talla: "XL", color: "Azul", stock: 5 },
    ],
  },
  {
    nombre: "Vestido Floral",
    descripcion:
      "Vestido con estampado floral y diseño fresco para diferentes ocasiones.",
    precio: 79900,
    categoria: "Vestidos",
    imagen:
      "https://images.unsplash.com/photo-1591369822096-ffd140ec948f?w=800",
    variantes: [
      { talla: "S", color: "Floral", stock: 5 },
      { talla: "M", color: "Floral", stock: 8 },
      { talla: "L", color: "Floral", stock: 4 },
    ],
  },
  {
    nombre: "Chaqueta Bomber",
    descripcion:
      "Chaqueta bomber de estilo urbano y moderno.",
    precio: 109900,
    categoria: "Chaquetas",
    imagen:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800",
    variantes: [
      { talla: "M", color: "Negro", stock: 6 },
      { talla: "L", color: "Negro", stock: 7 },
      { talla: "XL", color: "Negro", stock: 4 },
    ],
  },
  {
    nombre: "Camiseta Oversize",
    descripcion:
      "Camiseta de corte amplio para un estilo urbano y cómodo.",
    precio: 49900,
    categoria: "Camisetas",
    imagen:
      "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800",
    variantes: [
      { talla: "M", color: "Blanco", stock: 12 },
      { talla: "L", color: "Blanco", stock: 10 },
      { talla: "XL", color: "Blanco", stock: 8 },
    ],
  },
  {
    nombre: "Pantalón Cargo",
    descripcion:
      "Pantalón cargo con bolsillos laterales y diseño urbano.",
    precio: 89900,
    categoria: "Hombre",
    imagen:
      "https://images.unsplash.com/photo-1517445312882-4c4a2d5d1c2b?w=800",
    variantes: [
      { talla: "30", color: "Verde", stock: 6 },
      { talla: "32", color: "Verde", stock: 8 },
      { talla: "34", color: "Verde", stock: 5 },
    ],
  },
  {
    nombre: "Blazer Casual",
    descripcion:
      "Blazer moderno para complementar outfits casuales o elegantes.",
    precio: 129900,
    categoria: "Mujer",
    imagen:
      "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=800",
    variantes: [
      { talla: "S", color: "Negro", stock: 4 },
      { talla: "M", color: "Negro", stock: 6 },
      { talla: "L", color: "Negro", stock: 4 },
    ],
  },
  {
    nombre: "Jean Mom",
    descripcion:
      "Jean de corte mom con diseño clásico y cómodo.",
    precio: 82900,
    categoria: "Jeans",
    imagen:
      "https://images.unsplash.com/photo-1582418702059-97ebafb35d09?w=800",
    variantes: [
      { talla: "28", color: "Azul claro", stock: 5 },
      { talla: "30", color: "Azul claro", stock: 8 },
      { talla: "32", color: "Azul claro", stock: 6 },
    ],
  },
  {
    nombre: "Camiseta Estampada",
    descripcion:
      "Camiseta con estampado moderno para complementar looks casuales.",
    precio: 45900,
    categoria: "Camisetas",
    imagen:
      "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800",
    variantes: [
      { talla: "S", color: "Blanco", stock: 9 },
      { talla: "M", color: "Blanco", stock: 11 },
      { talla: "L", color: "Blanco", stock: 7 },
    ],
  },
  {
    nombre: "Vestido Negro",
    descripcion:
      "Vestido negro de diseño sencillo y elegante.",
    precio: 89900,
    categoria: "Vestidos",
    imagen:
      "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=800",
    variantes: [
      { talla: "S", color: "Negro", stock: 6 },
      { talla: "M", color: "Negro", stock: 8 },
      { talla: "L", color: "Negro", stock: 5 },
    ],
  },
  {
    nombre: "Chaqueta de Cuero",
    descripcion:
      "Chaqueta de estilo urbano para complementar diferentes atuendos.",
    precio: 149900,
    categoria: "Chaquetas",
    imagen:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800",
    variantes: [
      { talla: "S", color: "Negro", stock: 3 },
      { talla: "M", color: "Negro", stock: 5 },
      { talla: "L", color: "Negro", stock: 4 },
    ],
  },
  {
    nombre: "Camisa de Lino",
    descripcion:
      "Camisa ligera de estilo fresco para días cálidos.",
    precio: 79900,
    categoria: "Hombre",
    imagen:
      "https://images.unsplash.com/photo-1603252110481-7ba873bf42ab?w=800",
    variantes: [
      { talla: "M", color: "Beige", stock: 6 },
      { talla: "L", color: "Beige", stock: 8 },
      { talla: "XL", color: "Beige", stock: 5 },
    ],
  },
  {
    nombre: "Falda Denim",
    descripcion:
      "Falda de mezclilla versátil para diferentes combinaciones.",
    precio: 64900,
    categoria: "Mujer",
    imagen:
      "https://images.unsplash.com/photo-1583496661160-fb5886a13d27?w=800",
    variantes: [
      { talla: "S", color: "Azul", stock: 5 },
      { talla: "M", color: "Azul", stock: 7 },
      { talla: "L", color: "Azul", stock: 4 },
    ],
  },
  {
    nombre: "Pantalón Chino",
    descripcion:
      "Pantalón chino de corte clásico para un estilo casual.",
    precio: 84900,
    categoria: "Hombre",
    imagen:
      "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800",
    variantes: [
      { talla: "30", color: "Beige", stock: 6 },
      { talla: "32", color: "Beige", stock: 8 },
      { talla: "34", color: "Beige", stock: 5 },
    ],
  },
];

async function main() {
  console.log("🌱 Iniciando seed de Trendy...");

  // --------------------------------------------------
  // 1. Crear categorías activas
  // --------------------------------------------------
  const categoriasDB = {};

  for (const nombre of categorias) {
    const categoria = await prisma.categoria.upsert({
      where: { nombre },
      update: {
        estado: true,
      },
      create: {
        nombre,
        estado: true,
      },
    });

    categoriasDB[nombre] = categoria;
  }

  console.log(`✅ ${categorias.length} categorías creadas/actualizadas.`);

  // --------------------------------------------------
  // 2. Crear los 20 productos
  // --------------------------------------------------
  for (const productoData of productos) {
    const categoria = categoriasDB[productoData.categoria];

    if (!categoria) {
      throw new Error(
        `La categoría "${productoData.categoria}" no existe.`
      );
    }

    let producto = await prisma.producto.findFirst({
      where: {
        nombre: productoData.nombre,
      },
    });

    if (!producto) {
      producto = await prisma.producto.create({
        data: {
          nombre: productoData.nombre,
          descripcion: productoData.descripcion,
          precio: productoData.precio,
          categoriaId: categoria.id,
          estado: "ACTIVO",
        },
      });
    } else {
      producto = await prisma.producto.update({
        where: {
          id: producto.id,
        },
        data: {
          descripcion: productoData.descripcion,
          precio: productoData.precio,
          categoriaId: categoria.id,
          estado: "ACTIVO",
        },
      });
    }

    // ------------------------------------------------
    // Imagen principal
    // ------------------------------------------------
    const imagenExistente = await prisma.imagen.findFirst({
      where: {
        productoId: producto.id,
        esPrincipal: true,
      },
    });

    if (imagenExistente) {
      await prisma.imagen.update({
        where: {
          id: imagenExistente.id,
        },
        data: {
          url: productoData.imagen,
          orden: 0,
        },
      });
    } else {
      await prisma.imagen.create({
        data: {
          productoId: producto.id,
          url: productoData.imagen,
          esPrincipal: true,
          orden: 0,
        },
      });
    }

    // ------------------------------------------------
    // Variantes / tallas / stock
    // ------------------------------------------------
    for (const varianteData of productoData.variantes) {
      const skuBase = productoData.nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase();

      const sku = `${skuBase}-${varianteData.talla}-${varianteData.color
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()}`;

      await prisma.variante.upsert({
        where: {
          sku,
        },
        update: {
          talla: varianteData.talla,
          color: varianteData.color,
          stock: varianteData.stock,
          productoId: producto.id,
        },
        create: {
          productoId: producto.id,
          sku,
          talla: varianteData.talla,
          color: varianteData.color,
          stock: varianteData.stock,
        },
      });
    }

    console.log(`   ✔ ${productoData.nombre}`);
  }

  console.log(
    `\n🎉 Seed completado: ${productos.length} prendas disponibles.`
  );
}

main()
  .catch((error) => {
    console.error("❌ Error ejecutando el seed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });