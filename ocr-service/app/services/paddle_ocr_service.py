"""CPU OCR and conservative, geometry-based financial field extraction.
Handwriting uses the same recognizer; all extracted values need human review.
"""
from __future__ import annotations
import re
import threading
from decimal import Decimal, InvalidOperation
from datetime import datetime
from functools import lru_cache

_AMOUNT = re.compile(r"(?:[₱$]|PHP|Php)?\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*$")
_SUMMARY = re.compile(r"\b(total|subtotal|sub-total|cash|change|tax|vat|discount|balance|amount due)\b", re.I)

def parse_rows(rows: list[dict], pipeline: str) -> dict:
    fields, items = [], []
    for row in rows:
        text, confidence = row["text"].strip(), float(row["confidence"])
        control = re.search(r"(?:control|voucher|receipt|reference)(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]*)", text, re.I)
        if control:
            fields.append({"field_name": "control_number", "value": control.group(1), "confidence": confidence * .9})
        dates = re.search(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b", text)
        if dates:
            candidate = dates.group(1)
            for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y"):
                try:
                    value = datetime.strptime(candidate, fmt).date().isoformat()
                    fields.append({"field_name": "date", "value": value, "confidence": confidence * .85})
                    break
                except ValueError:
                    continue
        purpose = re.search(r"(?:purpose|description)\s*:\s*(.+)", text, re.I)
        if purpose:
            fields.append({"field_name": "purpose", "value": purpose.group(1), "confidence": confidence * .9})
        amount = _AMOUNT.search(text)
        if not amount:
            continue
        try:
            value = Decimal(amount.group(1).replace(",", ""))
        except InvalidOperation:
            continue
        if value <= 0:
            continue
        if re.search(r"\b(total|amount)\b", text, re.I) and not re.search(r"\b(subtotal|sub-total|tax|vat|discount)\b", text, re.I):
            fields.append({"field_name": "amount", "value": str(value), "confidence": confidence * .9})
        elif pipeline == "printed" and not _SUMMARY.search(text):
            particular = text[:amount.start()].strip()
            if particular and re.search(r"[A-Za-z]", particular):
                items.append({"particular": particular, "quantity": None, "unit_cost": None, "amount": float(value), "confidence": confidence * .85})
    return {"pipeline": pipeline, "raw_text": "\n".join(row["text"] for row in rows), "fields": fields, "line_items": items, "overall_confidence": sum(float(r["confidence"]) for r in rows) / len(rows) if rows else 0.0}


def group_words(words: list[dict]) -> list[dict]:
    """Combine price/name cells on the same visual row, independent of detection order."""
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (w["y"], w["x"])):
        matching = next((line for line in lines if abs(word["y"] - sum(w["y"] for w in line) / len(line)) <= min(word["height"], min(w["height"] for w in line)) * .5), None)
        if matching is None:
            lines.append([word])
        else:
            matching.append(word)
    return [{"text": " ".join(w["text"] for w in sorted(line, key=lambda w: w["x"])), "confidence": min(w["confidence"] for w in line)} for line in lines]


class PaddleOCRService:
    def __init__(self):
        from paddleocr import PaddleOCR
        # oneDNN's PIR executor fails on some Windows CPU builds; the plain CPU
        # executor is portable and avoids that failure.
        self.ocr = PaddleOCR(device="cpu", enable_mkldnn=False, cpu_threads=2, text_detection_model_name="PP-OCRv5_mobile_det", text_recognition_model_name="en_PP-OCRv5_mobile_rec", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
        self.lock = threading.Lock()

    def process(self, image, pipeline: str) -> dict:
        import numpy as np
        # Paddle accepts OpenCV-style BGR arrays.
        pixels = np.asarray(image.convert("RGB"))[:, :, ::-1].copy()
        words = []
        with self.lock:
            for page in self.ocr.predict(pixels):
                result = page if "rec_texts" in page else page.get("res", {})
                for text, confidence, polygon in zip(result.get("rec_texts", []), result.get("rec_scores", []), result.get("rec_polys", [])):
                    if not text.strip():
                        continue
                    xs, ys = [float(p[0]) for p in polygon], [float(p[1]) for p in polygon]
                    words.append({"text": text, "confidence": min(1., max(0., float(confidence))), "x": min(xs), "y": (min(ys) + max(ys)) / 2, "height": max(1., max(ys) - min(ys))})
        return parse_rows(group_words(words), pipeline)


@lru_cache(maxsize=1)
def get_ocr_service() -> PaddleOCRService:
    return PaddleOCRService()
