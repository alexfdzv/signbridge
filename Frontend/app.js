// ── Configuración ─────────────────────────────────────────────
const API_URL = "https://signbridge-api-d9f3hbc9ghh0dpbp.westus2-01.azurewebsites.net/api/predict";
const MIN_CONFIDENCE   = 0.70;
const CAPTURE_INTERVAL = 2000; // ms entre capturas
const HOLD_FRAMES      = 2;    // veces que debe repetirse la misma letra

// ── Estado ────────────────────────────────────────────────────
let stream        = null;
let intervalId    = null;
let currentWord   = "";
let sentence      = "";
let lastLetter    = "";
let holdCount     = 0;
let lastAdded     = "";
let handPresent   = false;

// ── Elementos DOM ─────────────────────────────────────────────
const video       = document.getElementById("video");
const overlay     = document.getElementById("overlay");
const capture     = document.getElementById("capture");
const overlayCtx  = overlay.getContext("2d");
const captureCtx  = capture.getContext("2d");

// ── MediaPipe Hands ───────────────────────────────────────────
const hands = new Hands({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.5
});

hands.onResults((results) => {
  // Resize overlay canvas to match video
  overlay.width  = video.videoWidth  || 640;
  overlay.height = video.videoHeight || 480;
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  handPresent = !!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);

  const badge = document.getElementById("handBadge");
  if (handPresent) {
    badge.textContent = "Mano detectada";
    badge.classList.add("detected");

    // Dibujar landmarks de la mano
    for (const landmarks of results.multiHandLandmarks) {
      drawConnectors(overlayCtx, landmarks, HAND_CONNECTIONS, { color: "#7a9e87", lineWidth: 2 });
      drawLandmarks(overlayCtx, landmarks, { color: "#ffffff", lineWidth: 1, radius: 3 });
    }
  } else {
    badge.textContent = "Sin mano detectada";
    badge.classList.remove("detected");
  }
});

// ── Cámara ────────────────────────────────────────────────────
async function startDetection() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = stream;
    await new Promise(resolve => video.onloadedmetadata = resolve);

    document.getElementById("statusPill").classList.add("active");
    document.getElementById("statusText").textContent = "Detectando";
    document.getElementById("btnStart").style.display = "none";
    document.getElementById("btnStop").style.display  = "block";

    // Iniciar MediaPipe en loop
    const camera = new Camera(video, {
      onFrame: async () => { await hands.send({ image: video }); },
      width: 640, height: 480
    });
    camera.start();

    // Iniciar capturas para la API
    intervalId = setInterval(captureAndPredict, CAPTURE_INTERVAL);

  } catch(e) {
    alert("No se pudo acceder a la cámara: " + e.message);
  }
}

function stopDetection() {
  clearInterval(intervalId);
  if (stream) stream.getTracks().forEach(t => t.stop());
  document.getElementById("statusPill").classList.remove("active");
  document.getElementById("statusText").textContent = "Detenido";
  document.getElementById("btnStart").style.display = "block";
  document.getElementById("btnStop").style.display  = "none";
  document.getElementById("handBadge").textContent  = "Sin mano detectada";
  document.getElementById("handBadge").classList.remove("detected");
}

// ── Predicción ────────────────────────────────────────────────
async function captureAndPredict() {
  // Solo predecir si hay mano
  if (!handPresent) {
    setLetter("—", 0);
    lastLetter = ""; holdCount = 0; lastAdded = "";
    return;
  }

  capture.width  = video.videoWidth  || 640;
  capture.height = video.videoHeight || 480;
  captureCtx.drawImage(video, 0, 0);

  capture.toBlob(async (blob) => {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob
      });

      const data = await res.json();
      if (data.error) return;

      const letter = data.letter.toUpperCase();
      const conf   = data.confidence;

      setLetter(letter, conf);

      // Lógica de escritura con hold frames
      if (conf >= MIN_CONFIDENCE * 100 && letter !== "NOTHING" && handPresent) {
        if (letter === lastLetter) holdCount++;
        else { holdCount = 1; lastLetter = letter; }

        if (holdCount >= HOLD_FRAMES && letter !== lastAdded) {
          if (letter === "SPACE") addSpace();
          else { currentWord += letter; lastAdded = letter; updateDisplay(); }
          holdCount = 0;
        }
      } else {
        lastLetter = ""; holdCount = 0; lastAdded = "";
      }

      document.getElementById("statusText").textContent = "Detectando";
      
    } catch(e) {
      document.getElementById("statusText").textContent = "Error conectando con API";
    }
  }, "image/jpeg", 0.85);
}

function setLetter(letter, conf) {
  const bubble = document.getElementById("letterBubble");
  bubble.textContent = letter;
  bubble.className   = "letter-bubble" + (letter === "—" ? " empty" : "");
  document.getElementById("confFill").style.width  = conf + "%";
  document.getElementById("confValue").textContent = conf > 0 ? conf.toFixed(1) + "%" : "—";
}

// ── Texto ──────────────────────────────────────────────────────
function updateDisplay() {
  document.getElementById("wordDisplay").innerHTML =
    currentWord + '<span class="cursor"></span>';
  const full = (sentence + " " + currentWord).trim();
  document.getElementById("sentenceDisplay").textContent =
    full || "Las palabras aparecerán aquí...";
}

function addSpace() {
  if (currentWord.trim()) {
    sentence = (sentence + " " + currentWord).trim();
    currentWord = ""; lastAdded = "";
    updateDisplay();
  }
}

function deleteLast() {
  if (currentWord.length > 0) currentWord = currentWord.slice(0, -1);
  else { const w = sentence.trim().split(" "); w.pop(); sentence = w.join(" "); }
  lastAdded = "";
  updateDisplay();
}

function clearAll() {
  currentWord = ""; sentence = "";
  lastLetter = ""; holdCount = 0; lastAdded = "";
  setLetter("—", 0);
  updateDisplay();
}