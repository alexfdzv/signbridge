import azure.functions as func
import logging
import os
import requests
import json

app = func.FunctionApp()

# ── Configuración desde variables de entorno (nunca en el código) ──
PREDICTION_KEY = os.environ.get("CUSTOM_VISION_KEY")
PREDICTION_URL = os.environ.get("CUSTOM_VISION_URL")

@app.route(route="predict", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def predict(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Predict endpoint called")

    # Validar que las variables de entorno están configuradas
    if not PREDICTION_KEY or not PREDICTION_URL:
        return func.HttpResponse(
            json.dumps({"error": "API keys not configured"}),
            status_code=500,
            mimetype="application/json"
        )

    # Leer el frame enviado desde el frontend
    image_data = req.get_body()
    if not image_data:
        return func.HttpResponse(
            json.dumps({"error": "No image data received"}),
            status_code=400,
            mimetype="application/json"
        )

    # Llamar a Azure Custom Vision
    headers = {
        "Prediction-Key": PREDICTION_KEY,
        "Content-Type": "application/octet-stream"
    }

    try:
        response = requests.post(PREDICTION_URL, headers=headers, data=image_data)
        response.raise_for_status()
        data = response.json()

        # Obtener la mejor predicción
        predictions = data.get("predictions", [])
        if not predictions:
            return func.HttpResponse(
                json.dumps({"letter": "nothing", "confidence": 0, "hand_detected": False}),
                mimetype="application/json"
            )

        best = max(predictions, key=lambda x: x["probability"])

        return func.HttpResponse(
            json.dumps({
                "letter":      best["tagName"].upper(),
                "confidence":  round(best["probability"] * 100, 2),
                "all":         [{"tag": p["tagName"], "prob": round(p["probability"]*100,2)}
                                for p in sorted(predictions, key=lambda x: -x["probability"])[:5]]
            }),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"}
        )

    except requests.exceptions.RequestException as e:
        logging.error(f"Custom Vision error: {e}")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            status_code=502,
            mimetype="application/json"
        )

@app.route(route="health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"status": "ok", "service": "SignBridge API"}),
        mimetype="application/json",
        headers={"Access-Control-Allow-Origin": "*"}
    )