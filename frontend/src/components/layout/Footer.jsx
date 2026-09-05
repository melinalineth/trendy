import React from "react";
import "./Footer.css";

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__container">

        {/* Información de la tienda */}
        <div className="footer__section footer__about">
          <h2 className="footer__logo">Trendy</h2>
          <p>
            Tu tienda virtual de ropa. Encuentra tu estilo y viste como quieras.
          </p>
        </div>

        {/* Enlaces */}
        <div className="footer__section">
          <h3>Trendy</h3>
          <a href="/">Inicio</a>
          <a href="/catalogo">Categorías</a>
          <a href="/novedades">Novedades</a>
          <a href="/ofertas">Ofertas</a>
        </div>

        {/* Atención al cliente */}
        <div className="footer__section">
          <h3>Atención al cliente</h3>
          <a href="/contacto">Contáctanos</a>
          <a href="/envios">Envíos</a>
          <a href="/devoluciones">Devoluciones</a>
          <a href="/preguntas">Preguntas frecuentes</a>
        </div>

        {/* Redes sociales */}
        <div className="footer__section">
          <h3>Síguenos</h3>

          <div className="footer__social">
            <a href="#" aria-label="Facebook">
              Facebook
            </a>

            <a href="#" aria-label="Instagram">
              Instagram
            </a>

            <a href="#" aria-label="TikTok">
              TikTok
            </a>
          </div>
        </div>

      </div>

      {/* Parte inferior */}
      <div className="footer__bottom">
        <p>
          © 2026 Trendy. Todos los derechos reservados.
        </p>

        <div className="footer__legal">
          <a href="/terminos">Términos y condiciones</a>
          <a href="/privacidad">Política de privacidad</a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;