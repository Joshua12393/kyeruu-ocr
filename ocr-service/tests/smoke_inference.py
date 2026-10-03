"""Real model smoke check, separate from fast regression tests."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from app.services.paddle_ocr_service import get_ocr_service

image = Image.new("RGB", (1000, 500), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 38)
for index, text in enumerate(["Receipt No: R-123", "Date: 10/03/2026", "Paper 100.00", "Pens 50.00", "Total 150.00"]):
    draw.text((40, 30 + index * 80), text, fill="black", font=font)
result = get_ocr_service().process(image, "printed")
assert result["raw_text"].strip(), result
assert result["line_items"], result
assert any(field["field_name"] == "amount" and field["value"] == "150.00" for field in result["fields"]), result
print("Real PaddleOCR inference passed:")
print(result)
target = Path("../.test-artifacts/ocr-smoke.png")
target.parent.mkdir(exist_ok=True)
image.save(target)
