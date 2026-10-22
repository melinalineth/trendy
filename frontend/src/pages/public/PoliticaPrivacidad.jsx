import { Link } from "react-router-dom";

import { LEGAL_FECHA_ISO, LEGAL_FECHA_TEXTO } from "./legalMeta";
import "./Legal.css";

// Política de privacidad (ruta pública /privacidad). Es el documento al que
// apunta la casilla del registro. El texto es un BORRADOR descriptivo y cada
// afirmación se verificó contra el código de la v1.0: datos del esquema de
// Prisma, contraseña con bcrypt, sesión en localStorage (token de 1 hora por
// defecto), sin analítica ni cookies, sin herramienta de borrado de datos.
// Está pendiente de revisión y aprobación del equipo de Trendy y no es
// asesoría legal. No se inventan datos de empresa (NIT, dirección, teléfono,
// correo ni jurisdicción): el canal de contacto está pendiente de definir.
const SECCIONES = [
  {
    id: "quien-trata-tus-datos",
    titulo: "Quién trata tus datos",
    cuerpo: (
      <>
        <p>
          Los datos que dejás en Trendy los trata el equipo de Trendy, un
          proyecto universitario de tienda de ropa en línea (versión 1.0). Los
          datos de contacto formales del equipo todavía están pendientes de
          definición.
        </p>
        <p>
          El equipo debe confirmar con una revisión profesional cómo se aplican
          a Trendy las normas colombianas de protección de datos personales
          (Ley 1581 de 2012, el derecho de «habeas data»). Esa revisión está
          pendiente: este texto no afirma que Trendy cumpla con esas normas.
        </p>
      </>
    ),
  },
  {
    id: "datos-que-recolectamos",
    titulo: "Qué datos recolectamos y para qué",
    cuerpo: (
      <>
        <ul className="legal__lista">
          <li>
            <strong>Cuenta:</strong> tu nombre, tu correo electrónico, tu
            contraseña (guardada solo como hash, ver más abajo), tu rol (por
            ejemplo, cliente), el estado de la cuenta y la fecha en que se creó.
            Sirven para que puedas registrarte e iniciar sesión.
          </li>
          <li>
            <strong>Direcciones de entrega:</strong> nombre del destinatario,
            teléfono, calle, ciudad, departamento y, si querés, código postal y
            referencias. Sirven para calcular el envío y entregar tus pedidos.
          </li>
          <li>
            <strong>Carrito y pedidos:</strong> los productos y cantidades que
            elegís, los precios, el costo de envío, el total, el medio de pago,
            la dirección usada y el estado del pedido y de su envío. Sirven para
            gestionar tu compra.
          </li>
          <li>
            <strong>Pagos:</strong> el medio de pago elegido, el estado del pago,
            el monto y, si pagás con Mercado Pago, una referencia del pago
            generada por esa plataforma. No guardamos los datos de tu tarjeta.
          </li>
          <li>
            <strong>Ventas:</strong> cuando un pedido se concreta, el sistema
            registra una venta con tu usuario como cliente, los montos, el medio
            de pago y el estado, y qué integrante del equipo la gestionó o la
            anuló, si corresponde.
          </li>
          <li>
            <strong>Recuperación de contraseña:</strong> si la pedís, se guarda
            un código de un solo uso, vinculado a tu cuenta, que vence a los 30
            minutos. Mirá también «Cómo se guardan» para saber dónde queda
            escrito ese código.
          </li>
        </ul>
        <p>
          No te pedimos documento de identidad ni datos bancarios. Usamos tus
          datos solo para operar la tienda: no los usamos para publicidad ni
          para perfilarte.
        </p>
      </>
    ),
  },
  {
    id: "como-guardamos-tus-datos",
    titulo: "Cómo se guardan",
    cuerpo: (
      <>
        <ul className="legal__lista">
          <li>
            Los datos de la cuenta, las direcciones, los pedidos, los pagos y
            las ventas se guardan en la base de datos del servidor de Trendy.
          </li>
          <li>
            Tu contraseña nunca se guarda tal cual la escribís: se guarda
            transformada con bcrypt (un hash), de modo que el equipo no puede
            leerla.
          </li>
          <li>
            Recuperación de contraseña: como Trendy todavía no envía correos, el
            código de recuperación y tu correo se escriben en el registro
            (consola) del servidor, al que accede quien lo administra. El código
            se guarda legible, sin transformarlo, hasta que vence (30 minutos) o
            se usa. Los registros del servidor también pueden contener otros
            mensajes de error.
          </li>
          <li>
            Ningún sistema es infalible: no podemos garantizar una seguridad
            absoluta.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "sesion-y-almacenamiento",
    titulo: "Sesión, almacenamiento local y cookies",
    cuerpo: (
      <>
        <p>
          Cuando iniciás sesión, el navegador guarda en su almacenamiento local
          (<em>localStorage</em>) un token de sesión y los datos básicos de tu
          cuenta (por ejemplo, tu nombre, tu correo y tu rol). El token vence
          por defecto a la hora de haberse emitido; al vencer, tenés que volver a
          iniciar sesión. Esos datos se borran del navegador cuando el servidor
          rechaza un token vencido o inválido, o si borrás los datos del sitio.
        </p>
        <p>
          No usamos cookies propias. No usamos herramientas de analítica,
          publicidad ni rastreo de tu actividad: revisamos el código de la
          tienda y no incluye ninguna. Hoy la tienda no tiene un botón para
          cerrar sesión: si compartís el dispositivo, usá una ventana privada o
          borrá los datos del sitio.
        </p>
      </>
    ),
  },
  {
    id: "quien-puede-ver-tus-datos",
    titulo: "Quién puede ver tus datos",
    cuerpo: (
      <>
        <ul className="legal__lista">
          <li>
            <strong>Vos:</strong> ves tus propias direcciones, tu carrito y tus
            pedidos. No ves los de otras personas.
          </li>
          <li>
            <strong>Vendedores y administradores:</strong> para gestionar la
            tienda ven los pedidos y las ventas.
            <ul className="legal__lista">
              <li>
                En los <strong>pedidos</strong> ven tu nombre, tu correo, la
                dirección de entrega completa (destinatario, teléfono, calle,
                ciudad, departamento y, si los cargaste, código postal y
                referencia) y los productos que compraste.
              </li>
              <li>
                En las <strong>ventas</strong> ven tu nombre.
              </li>
            </ul>
          </li>
          <li>
            <strong>Administradores:</strong> además ven el listado de usuarios
            (nombre, correo, rol y estado), pueden activar o desactivar cuentas
            y editar los permisos de cada rol.
          </li>
          <li>
            Quienes administran el servidor y la base de datos pueden, por la
            naturaleza de su trabajo, acceder a la información almacenada.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "terceros",
    titulo: "Terceros",
    cuerpo: (
      <>
        <ul className="legal__lista">
          <li>
            <strong>Mercado Pago:</strong> solo si elegís pagar con esa
            plataforma. Te llevamos a su sitio para pagar y ellos procesan el
            pago con sus propios términos y su propia política de privacidad. Esa
            integración todavía no se probó con el servicio real.
          </li>
          <li>
            <strong>Imágenes de productos:</strong> algunas imágenes del catálogo
            se cargan desde sitios externos. Al mostrarlas, tu navegador se
            conecta a esos sitios y ellos pueden ver datos técnicos de la
            conexión, como tu dirección IP.
          </li>
        </ul>
        <p>No vendemos ni cedemos tus datos a terceros con fines comerciales.</p>
      </>
    ),
  },
  {
    id: "conservacion",
    titulo: "Cuánto tiempo los conservamos",
    cuerpo: (
      <>
        <p>
          Hoy tus datos se conservan en la base de datos sin un plazo definido.
          No existe todavía una herramienta para borrarlos: ni desde tu cuenta ni
          desde el panel del equipo (los administradores solo pueden desactivar
          una cuenta, lo que impide iniciar sesión pero no elimina la
          información). Los pedidos y las ventas forman parte del registro de la
          tienda. El plazo de conservación está pendiente de definición por el
          equipo de Trendy.
        </p>
      </>
    ),
  },
  {
    id: "tus-derechos",
    titulo: "Tus derechos y cómo ejercerlos",
    cuerpo: (
      <>
        <p>
          Esperamos reconocerte, como mínimo, los derechos de conocer, actualizar
          y rectificar tus datos y de solicitar que se supriman. El equipo de
          Trendy debe confirmar el alcance exacto con una revisión de la norma
          aplicable, que está pendiente.
        </p>
        <p>
          Hoy la tienda no tiene pantallas para editar tu perfil ni para editar o
          borrar direcciones guardadas, y el canal para presentar estas
          solicitudes todavía no está definido. Cuando exista, lo vamos a
          publicar en esta sección.
        </p>
      </>
    ),
  },
  {
    id: "cambios",
    titulo: "Cambios en esta política",
    cuerpo: (
      <>
        <p>
          El equipo de Trendy puede actualizar esta política. La fecha de «Última
          actualización» de arriba indica la versión vigente.
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
          de definición. Las condiciones de uso de la tienda están en los{" "}
          <Link to="/terminos">términos de uso</Link>.
        </p>
      </>
    ),
  },
];

function PoliticaPrivacidad() {
  return (
    <main className="legal">
      <p className="legal__borrador" role="note">
        Borrador: este texto está pendiente de revisión y aprobación del equipo
        de Trendy. No constituye asesoría legal.
      </p>

      <header className="legal__encabezado">
        <h1 className="legal__titulo">Política de privacidad</h1>
        <p className="legal__fecha">
          Última actualización:{" "}
          <time dateTime={LEGAL_FECHA_ISO}>{LEGAL_FECHA_TEXTO}</time>
        </p>
        <p className="legal__intro">
          Acá te contamos, en lenguaje simple, qué datos tuyos usa la tienda de
          Trendy, para qué y quién puede verlos.
        </p>
      </header>

      <nav className="legal__indice" aria-labelledby="privacidad-indice">
        <h2 className="legal__indice-titulo" id="privacidad-indice">
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
        <Link to="/terminos">Términos de uso</Link>
        <Link to="/registro">Volver al registro</Link>
      </footer>
    </main>
  );
}

export default PoliticaPrivacidad;
