// ---------- Datos ----------

// Archivos que el usuario eligió para enviar
const archivosParaEnviar = [];

// Tamaño de cada parte en que cortamos los archivos (64 KB)
const TAMANO_PARTE = 64 * 1024;

// Archivos que estamos recibiendo ahora mismo, guardados por su id
const recibiendo = {};

// Evita enviar dos veces a la vez
let enviando = false;

// ---------- Utilidades ----------

// Convierte bytes a un texto fácil de leer (KB, MB, GB)
function formatearTamano(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// Pausa la función durante unos milisegundos (se usa con await)
function esperar(milisegundos) {
  return new Promise(function (resolver) {
    setTimeout(resolver, milisegundos);
  });
}

// Si hay demasiados datos esperando salir, hacemos una pausa hasta que se liberen
async function esperarEspacio() {
  while (
    conexion && conexion.open &&
    ((conexion.dataChannel && conexion.dataChannel.bufferedAmount > 1024 * 1024) ||
      conexion.bufferSize > 20)
  ) {
    await esperar(20);
  }
}

// ---------- Lista de archivos a enviar ----------

// Recibe archivos (del selector o de arrastrar) y los añade a la lista
function agregarArchivos(listaDeArchivos) {
  for (const archivo of listaDeArchivos) {
    archivosParaEnviar.push(archivo);
  }
  mostrarArchivos();
}

// Dibuja la lista de archivos en la página
function mostrarArchivos() {
  const lista = document.getElementById("lista-envios");
  lista.innerHTML = "";

  for (const archivo of archivosParaEnviar) {
    const item = document.createElement("li");
    item.textContent = archivo.name + " (" + formatearTamano(archivo.size) + ")";
    lista.appendChild(item);
  }
}

// ---------- Enviar ----------

async function enviarArchivos() {
  if (enviando) return;
  if (conexion === null || !conexion.open) {
    mostrarEstado("Primero conecta con otro dispositivo.");
    return;
  }
  if (archivosParaEnviar.length === 0) {
    mostrarEstado("Primero elige algún archivo.");
    return;
  }

  enviando = true;
  const boton = document.getElementById("btn-enviar");
  const barra = document.getElementById("barra-envio");
  const texto = document.getElementById("texto-envio");
  boton.disabled = true;
  barra.hidden = false;
  texto.hidden = false;

  let completado = true;

  try {
    const total = archivosParaEnviar.length;

    for (let i = 0; i < total; i++) {
      const archivo = archivosParaEnviar[i];
      const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);

      // 1) Avisamos qué archivo viene
      conexion.send({
        tipo: "inicio",
        id: id,
        nombre: archivo.name,
        mime: archivo.type,
        tamano: archivo.size
      });

      // 2) Lo enviamos por partes
      let numeroDeParte = 0;
      for (let posicion = 0; posicion < archivo.size; posicion += TAMANO_PARTE) {
        if (conexion === null || !conexion.open) {
          completado = false;
          break;
        }

        const trozo = await archivo.slice(posicion, posicion + TAMANO_PARTE).arrayBuffer();
        conexion.send({ tipo: "parte", id: id, n: numeroDeParte, datos: trozo });
        numeroDeParte++;

        await esperarEspacio();

        const enviado = Math.min(posicion + TAMANO_PARTE, archivo.size);
        const porcentaje = Math.round((enviado / archivo.size) * 100);
        barra.value = porcentaje;
        texto.textContent =
          "Enviando " + archivo.name + " (" + (i + 1) + " de " + total + "): " + porcentaje + "%";
      }

      if (!completado) break;

      // 3) Avisamos que terminó, e indicamos cuántas partes mandamos
      conexion.send({ tipo: "fin", id: id, partes: numeroDeParte });
    }
  } finally {
    enviando = false;
    boton.disabled = false;
  }

  if (completado) {
    texto.textContent = "Enviado ✔";
    barra.value = 100;
    archivosParaEnviar.length = 0;
    mostrarArchivos();
  } else {
    texto.textContent = "Se perdió la conexión antes de terminar.";
  }
}

// ---------- Recibir ----------

// Según el tipo de mensaje, hacemos una cosa u otra
function recibirMensaje(mensaje) {
  if (mensaje.tipo === "inicio") iniciarRecepcion(mensaje);
  else if (mensaje.tipo === "parte") recibirParte(mensaje);
  else if (mensaje.tipo === "fin") terminarRecepcion(mensaje);
}

function iniciarRecepcion(mensaje) {
  const lista = document.getElementById("lista-recibidos");
  const aviso = lista.querySelector(".vacio");
  if (aviso) aviso.remove();

  const item = document.createElement("li");
  const texto = document.createElement("span");
  const barra = document.createElement("progress");
  texto.textContent = "Recibiendo " + mensaje.nombre + "...";
  barra.max = 100;
  barra.value = 0;
  item.appendChild(texto);
  item.appendChild(barra);
  lista.appendChild(item);

  recibiendo[mensaje.id] = {
    nombre: mensaje.nombre,
    mime: mensaje.mime,
    tamano: mensaje.tamano,
    partes: [],
    recibidas: 0,
    bytes: 0,
    item: item,
    texto: texto,
    barra: barra
  };
}

function recibirParte(mensaje) {
  const r = recibiendo[mensaje.id];
  if (!r) return;

  // Guardamos la parte como Blob en su posición (n)
  r.partes[mensaje.n] = new Blob([mensaje.datos]);
  r.recibidas++;
  r.bytes += mensaje.datos.byteLength;

  const porcentaje = r.tamano > 0 ? Math.round((r.bytes / r.tamano) * 100) : 100;
  r.barra.value = porcentaje;
  r.texto.textContent = "Recibiendo " + r.nombre + ": " + porcentaje + "%";
}

function terminarRecepcion(mensaje) {
  const r = recibiendo[mensaje.id];
  if (!r) return;
  delete recibiendo[mensaje.id];

  // Comprobamos que llegaron todas las partes
  if (r.recibidas !== mensaje.partes) {
    r.item.textContent = r.nombre + ": llegó incompleto, pide que lo envíen otra vez.";
    return;
  }

  // Unimos las partes y creamos el enlace de descarga
  const blob = new Blob(r.partes, { type: r.mime });
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = r.nombre;
  enlace.textContent = "Descargar " + r.nombre + " (" + formatearTamano(blob.size) + ")";

  r.item.textContent = "";
  r.item.appendChild(enlace);
}
