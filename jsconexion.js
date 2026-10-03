// "peer" es este dispositivo; "conexion" es el enlace con el otro dispositivo
let peer = null;
let conexion = null;

// Nombre con el que guardamos el código en el navegador
const CLAVE_CODIGO = "mt-codigo-guardado";

// Lee el código guardado (devuelve null si no hay o si el navegador lo impide)
function leerCodigoGuardado() {
  try {
    return localStorage.getItem(CLAVE_CODIGO);
  } catch (error) {
    return null;
  }
}

// Guarda el código en el navegador para que no cambie al recargar
function guardarCodigo(codigo) {
  try {
    localStorage.setItem(CLAVE_CODIGO, codigo);
  } catch (error) {
    // si no se puede guardar, la app sigue funcionando igual
  }
}

// Escribe un mensaje en el párrafo de estado
function mostrarEstado(texto) {
  document.getElementById("estado").textContent = texto;
}

// Crea un código de 6 caracteres (sin letras confusas como O, 0, I, 1)
function generarCodigo() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 6; i++) {
    const posicion = Math.floor(Math.random() * caracteres.length);
    codigo += caracteres[posicion];
  }
  return codigo;
}

// Muestra el código y dibuja el QR que lleva a esta página con el código dentro
function mostrarCodigo(codigo) {
  document.getElementById("mi-codigo").textContent = codigo;

  const contenedor = document.getElementById("qr");
  contenedor.innerHTML = "";
  if (typeof QRCode === "undefined") return; // la librería no cargó

  const enlace = location.origin + location.pathname + "?conectar=" + codigo;
  new QRCode(contenedor, { text: enlace, width: 160, height: 160 });
}

// Si la página se abrió desde un QR (?conectar=CODIGO), conecta sola
function conectarPorURL(miCodigo) {
  const parametros = new URLSearchParams(location.search);
  const destino = parametros.get("conectar");

  if (destino && destino.toUpperCase() !== miCodigo) {
    conectarCon(destino);
  }
  // Limpia la dirección para que al recargar no se repita
  history.replaceState(null, "", location.pathname);
}

// Registra este dispositivo en el servidor gratuito de PeerJS
function iniciarPeer(codigo, intentos) {
  const guardado = leerCodigoGuardado();
  if (codigo === undefined) codigo = guardado || generarCodigo();
  if (intentos === undefined) intentos = 0;

  peer = new Peer("mt-" + codigo); // "mt-" evita choques con otras apps

  // Ya estamos registrados: mostramos el código y lo guardamos si es el primero
  peer.on("open", function () {
    mostrarCodigo(codigo);
    if (!guardado) guardarCodigo(codigo);
    conectarPorURL(codigo);
  });

  // Alguien se conectó a nosotros
  peer.on("connection", function (nuevaConexion) {
    configurarConexion(nuevaConexion);
  });

  peer.on("error", function (error) {
    if (error.type === "unavailable-id") {
      if (codigo === guardado && intentos < 3) {
        // Al recargar, el servidor tarda un poco en soltar el código viejo
        setTimeout(function () {
          iniciarPeer(codigo, intentos + 1);
        }, 1500);
      } else {
        iniciarPeer(generarCodigo(), 0); // código ocupado: usamos otro temporal
      }
    } else if (error.type === "peer-unavailable") {
      mostrarEstado("No se encontró ese código. Revísalo.");
    } else {
      mostrarEstado("Error: " + error.type);
    }
  });
}

// Nos conectamos al código que escribió el usuario
function conectarCon(codigoDestino) {
  const codigoLimpio = codigoDestino.trim().toUpperCase();
  if (codigoLimpio === "") {
    mostrarEstado("Escribe un código primero.");
    return;
  }
  mostrarEstado("Conectando...");
  configurarConexion(peer.connect("mt-" + codigoLimpio, { reliable: true }));
}

// Define qué pasa cuando la conexión se abre, recibe datos o se cierra
function configurarConexion(nuevaConexion) {
  conexion = nuevaConexion;

  conexion.on("open", function () {
    mostrarEstado("Conectado ✔");
  });

  conexion.on("data", function (mensaje) {
    recibirMensaje(mensaje);
  });

  conexion.on("close", function () {
    mostrarEstado("Conexión cerrada");
    conexion = null;
  });
}

// Al cerrar o recargar la pestaña, liberamos el código en el servidor
window.addEventListener("beforeunload", function () {
  if (peer) peer.destroy();
});
