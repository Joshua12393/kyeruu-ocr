"""Repeatable sample benchmark. Supply anonymized images and ground truth; no training.

python tests/benchmark.py manifest.json --output report.json [--url http://127.0.0.1:8000]
Manifest: {"dataset_kind":"handwritten", "samples":[{"image":"receipt.png",
"fields":{"amount":"150.00"}, "items":[{"particular":"Paper","amount":100}],
"raw_text":"optional human transcription"}]}
Run twice with different --url services to compare a candidate against the baseline.
Never treat a synthetic printed benchmark as handwriting accuracy.
"""
import argparse
import json
import mimetypes
import os
import time
from pathlib import Path
from decimal import Decimal
import httpx


def edit_distance(expected, actual):
    row = list(range(len(actual) + 1))
    for i, left in enumerate(expected, 1):
        next_row = [i]
        for j, right in enumerate(actual, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1, row[j - 1] + (left != right)))
        row = next_row
    return row[-1]


def equivalent(key, expected, actual):
    if expected is None or actual is None:
        return expected is actual
    if key in {"amount", "quantity", "unit_cost"}:
        try:
            return Decimal(str(expected)) == Decimal(str(actual))
        except Exception:
            return False
    return " ".join(str(expected).split()).casefold() == " ".join(str(actual).split()).casefold()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf8"))
    kind = manifest.get("dataset_kind")
    if kind not in {"printed", "synthetic-printed", "handwritten"} or not manifest.get("samples"):
        parser.error("Provide a dataset_kind and a nonempty list of labeled samples.")
    pipeline = "handwritten" if kind == "handwritten" else "printed"
    rows = []
    with httpx.Client(timeout=240) as client:
        for sample in manifest["samples"]:
            image = (args.manifest.parent / sample["image"]).resolve()
            started = time.perf_counter()
            try:
                response = client.post(args.url.rstrip("/") + "/api/ocr/extract/" + pipeline,
                    headers={"X-OCR-Token": os.getenv("OCR_SERVICE_TOKEN", "")},
                    files={"file": (image.name, image.read_bytes(), mimetypes.guess_type(image.name)[0])})
                response.raise_for_status()
                result = response.json()
                fields = {field["field_name"]: field["value"] for field in result["fields"]}
                checks = [equivalent(key, value, fields.get(key)) for key, value in sample.get("fields", {}).items()]
                actual_items = result["line_items"]
                for index, expected in enumerate(sample.get("items", [])):
                    actual = actual_items[index] if index < len(actual_items) else {}
                    checks.extend(equivalent(key, value, actual.get(key)) for key, value in expected.items())
                extra = max(0, len(actual_items) - len(sample.get("items", []))) if "items" in sample else 0
                checks.extend([False] * extra)
                truth = sample.get("raw_text")
                rows.append({"sample": image.name, "engine": result.get("engine"),
                    "seconds": round(time.perf_counter() - started, 3), "evaluated_values": len(checks),
                    "correct_values": sum(checks), "corrections_required": len(checks) - sum(checks),
                    "character_error_rate": edit_distance(truth, result["raw_text"]) / max(1, len(truth)) if truth else None,
                    "error": None})
            except Exception as error:
                rows.append({"sample": image.name, "seconds": round(time.perf_counter() - started, 3), "error": str(error)})
    evaluated = sum(row.get("evaluated_values", 0) for row in rows)
    correct = sum(row.get("correct_values", 0) for row in rows)
    report = {"dataset_kind": kind, "sample_count": len(rows), "failed_samples": sum(bool(row["error"]) for row in rows),
        "value_accuracy_on_successful_samples": correct / evaluated if evaluated else None,
        "measured_values": evaluated, "corrections_required": evaluated - correct, "samples": rows,
        "limitations": "Labeled values only; item order matters. No human entry-time measurement. Synthetic printed data cannot establish handwriting accuracy."}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
