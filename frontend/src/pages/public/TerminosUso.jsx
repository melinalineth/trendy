import { Link } from "react-router-dom";

import "./Legal.css";

// Términos de uso (ruta pública /terminos). Es el documento al que apunta la
// casilla del registro. El texto es un BORRADOR descriptivo: cuenta lo que la
// tienda hace hoy (v1.0) y no promete nada que el sistema no tenga. Está
// pendiente de revisión y aprobación del equipo de Trendy y no es asesoría
// legal. No se inventan datos de empresa (NIT, dirección, teléfono, correo ni
// jurisdicción): el canal de contacto está pendiente de definir.
const SECCIONES = [
  {
    id: "que-es-trendy",
    titulo: "Qué es Trendy",
    cuerpo: (
      <>
        <p>
          Trendy es una tienda de ropa en línea pensada para estudiantes. Hoy es
          un proyecto universitario en su versión 1.0: permite ver el catálogo,
          armar un carrito, hacer pedidos y seguir su estado.
        </p>
        <p>
          Al crear una cuenta o usar la tienda aceptás estos términos. Si no
          estás de acuerdo con alguna parte, no la uses.
        </p>
      </>
    ),
  },
  {
    id: "cuentas",
    titulo: "Tu cuenta y tus credenciales",
    cuerpo: (
      <>
        <p>
          Para comprar necesitás una cuenta con tu nombre, tu correo electrónico
          y una contraseña de al menos 8 caracteres. Para registrarte tenés que
          marcar la casilla en la que aceptás estos términos y la{" "}
          <Link to="/privacidad">política de privacidad</Link>.
        </p>
        <ul className="legal__lista">
          <li>Los datos que cargues tienen que ser verdaderos y tuyos.</li>
          <li>
            La contraseña es personal: cuidala y no la compartas. Lo que se haga
            con tu cuenta se considera hecho por vos.
          </li>
          <li>
            Si perdés la contraseña, la pantalla de recuperación genera un
            código de un solo uso que vence a los 30 minutos. Hoy Trendy no
            envía correos: el código lo gestiona quien administra el servidor.
          </li>
          <li>
            El equipo de Trendy puede desactivar una cuenta. Una cuenta
            desactivada no puede iniciar sesión.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "pedidos-y-precios",
    titulo: "Pedidos y precios",
    cuerpo: (
      <>
        <ul className="legal__lista">
          <li>
            Los precios se muestran en pesos y los fija el equipo de Trendy. El
            precio de cada producto queda fijo en el momento en que se crea el
            pedido: si después cambia en el catálogo, tu pedido conserva el
            precio original.
          </li>
          <li>
            Al crear un pedido, el stock de los productos queda reservado para
            ese pedido. Si no alcanza el stock de alguna prenda, el pedido no
            se crea.
          </li>
          <li>
            El total del pedido es la suma de los productos más el costo de
            envío de tu zona. Lo ves antes de confirmar.
          </li>
          <li>
            Las imágenes del catálogo son referenciales y pueden variar un poco
            respecto del producto real.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "pagos",
    titulo: "Medios de pago",
    cuerpo: (
      <>
        <p>En el momento de pagar vas a ver estas opciones:</p>
        <ul className="legal__lista">
          <li>
            <strong>Pago contra entrega:</strong> pagás al recibir el pedido.
            Solo está disponible en las zonas donde el equipo de Trendy lo
            habilitó; si tu dirección está en otra zona, no vas a poder elegirlo.
          </li>
          <li>
            <strong>Mercado Pago:</strong> se ofrece en el checkout y te lleva a
            la plataforma de Mercado Pago para pagar. Esa integración todavía
            no se probó con el servicio real, así que no podemos garantizar que
            funcione. El pago lo procesa Mercado Pago, que tiene sus propios
            términos. Si un pedido con este medio no se paga dentro del plazo
            previsto, el equipo puede cancelarlo.
          </li>
        </ul>
        <p>
          Trendy no guarda los datos de tu tarjeta ni de tu medio de pago.
        </p>
      </>
    ),
  },
  {
    id: "envios",
    titulo: "Envíos",
    cuerpo: (
      <>
        <p>
          Solo enviamos a las zonas de cobertura que el equipo de Trendy tiene
          cargadas. Si la dirección que elegís queda fuera de esas zonas, no
          podés finalizar la compra con ella.
        </p>
        <p>
          El costo de envío depende de la zona y se muestra antes de confirmar.
          El estado del envío lo actualiza el equipo de Trendy y lo ves en el
          detalle de tu pedido. No prometemos plazos de entrega exactos.
        </p>
      </>
    ),
  },
  {
    id: "cancelaciones",
    titulo: "Cancelaciones y cambios",
    cuerpo: (
      <>
        <p>
          Hoy no podés cancelar un pedido desde la tienda: las cancelaciones las
          hace el personal de Trendy (administradores y vendedores) a pedido
          tuyo. Cuando un pedido se cancela, su stock vuelve a quedar
          disponible.
        </p>
        <ul className="legal__lista">
          <li>
            Un pedido que todavía no avanzó se puede cancelar.
          </li>
          <li>
            Un pedido contra entrega ya confirmado se puede cancelar mientras
            no se haya entregado.
          </li>
          <li>
            Un pedido pagado con Mercado Pago y ya confirmado no se cancela
            desde el sistema.
          </li>
        </ul>
        <p>
          Los cambios de talla, de color o de dirección sobre un pedido ya
          creado tampoco se hacen desde la tienda: se coordinan con el equipo de
          Trendy, sin garantía de que sean posibles.
        </p>
      </>
    ),
  },
  {
    id: "reembolsos",
    titulo: "Reembolsos y devoluciones",
    cuerpo: (
      <>
        <p>
          El sistema no gestiona reembolsos ni devoluciones. La política de
          devoluciones todavía está pendiente de definición por parte del equipo
          de Trendy y, hasta que se publique, no podemos asegurar que un
          reembolso sea posible.
        </p>
      </>
    ),
  },
  {
    id: "uso-aceptable",
    titulo: "Uso aceptable",
    cuerpo: (
      <>
        <p>Al usar Trendy te comprometés a no:</p>
        <ul className="legal__lista">
          <li>Usar datos falsos ni hacerte pasar por otra persona.</li>
          <li>
            Intentar entrar a cuentas, pedidos o datos de otras personas ni a
            las secciones del personal.
          </li>
          <li>
            Interferir con el funcionamiento de la tienda ni sobrecargarla a
            propósito.
          </li>
          <li>Hacer pedidos sin intención de recibirlos o pagarlos.</li>
        </ul>
        <p>
          Si se incumple esto, el equipo puede cancelar pedidos o desactivar la
          cuenta.
        </p>
      </>
    ),
  },
  {
    id: "disponibilidad",
    titulo: "Disponibilidad del servicio",
    cuerpo: (
      <>
        <p>
          Trendy es un proyecto en desarrollo. No garantizamos que el sitio esté
          disponible de forma continua ni libre de errores, y puede tener
          interrupciones, cambios o dejar de funcionar sin aviso previo. La
          disponibilidad de los productos depende del stock cargado.
        </p>
      </>
    ),
  },
  {
    id: "cambios",
    titulo: "Cambios en estos términos",
    cuerpo: (
      <>
        <p>
          El equipo de Trendy puede modificar estos términos. La fecha de
          «Última actualización» de arriba indica la versión vigente. Seguir
          usando la tienda después de un cambio implica aceptar la nueva
          versión.
        </p>
      </>
    ),
  },
  {
    id: "contacto",
    titulo: "Contacto",
    cuerpo: (
      <>
        <p>
          Los canales de contacto del equipo de Trendy todavía están pendientes
          de definición. Cuando existan, se van a publicar en esta sección. El
          tratamiento de tus datos personales se explica en la{" "}
          <Link to="/privacidad">política de privacidad</Link>.
        </p>
      </>
    ),
  },
];

function TerminosUso() {
  return (
    <main className="legal">
      <p className="legal__borrador" role="note">
        Borrador: este texto está pendiente de revisión y aprobación del equipo
        de Trendy. No constituye asesoría legal.
      </p>

      <header className="legal__encabezado">
        <h1 className="legal__titulo">Términos de uso</h1>
        <p className="legal__fecha">
          Última actualización: <time dateTime="2026-10-21">21 de octubre de 2026</time>
        </p>
        <p className="legal__intro">
          Estas son las reglas para usar la tienda en línea de Trendy. Están
          escritas en lenguaje simple y describen cómo funciona la tienda hoy.
        </p>
      </header>

      <nav className="legal__indice" aria-labelledby="terminos-indice">
        <h2 className="legal__indice-titulo" id="terminos-indice">
          Contenido
        </h2>
        <ol className="legal__indice-lista">
          {SECCIONES.map((seccion) => (
            <li key={seccion.id}>
              <a href={`#${seccion.id}`}>{seccion.titulo}</a>
            </li>
          ))}
        </ol>
      </nav>

      {SECCIONES.map((seccion, indice) => (
        <section
          key={seccion.id}
          id={seccion.id}
          className="legal__seccion"
          aria-labelledby={`${seccion.id}-titulo`}
        >
          <h2 className="legal__seccion-titulo" id={`${seccion.id}-titulo`}>
            {indice + 1}. {seccion.titulo}
          </h2>
          {seccion.cuerpo}
        </section>
      ))}

      <footer className="legal__pie">
        <Link to="/privacidad">Política de privacidad</Link>
        <Link to="/registro">Volver al registro</Link>
      </footer>
    </main>
  );
}

export default TerminosUso;
