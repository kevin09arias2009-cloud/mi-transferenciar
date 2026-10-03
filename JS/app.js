// Buscamos los elementos del HTML por su id
const selector = document.getElementById("selector-archivos");
const zona = document.getElementById("zona-soltar");

// Cuando el usuario elige archivos con el selector
selector.addEventListener("change", function () {
  agregarArchivos(selector.files);
  selector.value = ""; // permite volver a elegir el mismo archivo
});

// Mientras arrastras un archivo por encima de la zona
zona.addEventListener("dragover", function (evento) {
  evento.preventDefault(); // sin esto el navegador no permite soltar
  zona.classList.add("arrastrando");
});

// Cuando el archivo sale de la zona sin soltarse
zona.addEventListener("dragleave", function () {
  zona.classList.remove("arrastrando");
});

// Cuando sueltas el archivo en la zona
zona.addEventListener("drop", function (evento) {
  evento.preventDefault(); // evita que el navegador abra el archivo
  zona.classList.remove("arrastrando");
  agregarArchivos(evento.dataTransfer.files);
});

// Botones de conexión y envío
document.getElementById("btn-conectar").addEventListener("click", function () {
  conectarCon(document.getElementById("codigo-destino").value);
});

document.getElementById("btn-enviar").addEventListener("click", enviarArchivos);

// Al abrir la página, registramos este dispositivo y generamos su código
iniciarPeer();
