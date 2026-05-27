"""
PlateGuardian — YOLOService
Wraps YOLOv11 Nano inference + OpenCV annotation.
"""

from __future__ import annotations
import base64
import numpy as np
import cv2
from pathlib import Path
from ultralytics import YOLO

# Relative import based on your project structure
from ..models.schemas import BoundingBox

# Colour palette per label (deterministic hash → hue)
def _label_colour(label: str) -> tuple[int, int, int]:
    hue = hash(label) % 180
    hsv = np.uint8([[[hue, 220, 220]]])
    bgr = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)[0][0]
    return int(bgr[0]), int(bgr[1]), int(bgr[2])


class YOLOService:
    """Loads YOLOv11 Nano and exposes a single `detect()` method."""

    def __init__(self, model_path: str = "backend/weights/yolo11n.pt"):
        if not Path(model_path).exists():
            print(f"⚠️  {model_path} not found – downloading yolo11n from Ultralytics hub …")
        
        # Load the model and fuse for faster CPU inference
        self.model = YOLO(model_path)
        self.model.fuse() 
        print(f"✅  YOLOv11 Nano loaded successfully: {model_path}")

    # ── Public API ─────────────────────────────────────────────────────────────
    def detect(
        self,
        image_bytes: bytes,
        conf_threshold: float = 0.35,
        iou_threshold:  float = 0.45,
    ) -> tuple[list[BoundingBox], str]:
        """
        Run inference on raw image bytes.
        """
        # 1. Decode bytes into a fresh BGR image for this specific request
        nparr = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img_bgr is None:
            return [], ""

        h, w = img_bgr.shape[:2]

        # 2. Run Inference on the actual image provided
        results = self.model(
            img_bgr,
            conf=conf_threshold,
            iou=iou_threshold,
            verbose=False,
            stream=False # Ensures we get the result immediately for this file
        )[0]

        detections: list[BoundingBox] = []
        annotated = img_bgr.copy()

        # 3. Process detections
        for box in results.boxes:
            # Absolute coordinates
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            cls = int(box.cls[0])
            label = self.model.names[cls]

            # Normalise to 0–1 (Required for the frontend UI boxes)
            bx = x1 / w
            by = y1 / h
            bw = (x2 - x1) / w
            bh = (y2 - y1) / h

            detections.append(
                BoundingBox(x=bx, y=by, w=bw, h=bh, label=label, conf=conf)
            )

            # Draw on the thumbnail for the "Meal Scanner" preview
            colour = _label_colour(label)
            cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), colour, 2)
            cv2.putText(
                annotated,
                f"{label} {conf:.0%}",
                (int(x1), max(int(y1) - 6, 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55, colour, 2, cv2.LINE_AA,
            )

        # 4. Create the final Base64 PNG thumbnail
        scale = min(1.0, 640 / w)
        thumb = cv2.resize(annotated, (int(w * scale), int(h * scale)))
        _, buf = cv2.imencode(".png", thumb)
        annotated_b64 = base64.b64encode(buf.tobytes()).decode()

        return detections, annotated_b64