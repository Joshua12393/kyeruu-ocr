import io
import os
import unittest
from unittest.mock import patch, Mock
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.services.paddle_ocr_service import parse_rows, group_words

class OcrTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        buffer = io.BytesIO()
        Image.new("RGB", (100, 100), "white").save(buffer, format="PNG")
        self.image = buffer.getvalue()

    def test_financial_rows_exclude_totals_from_line_items(self):
        rows = [{"text": text, "confidence": .9} for text in ["Receipt No: R-123", "Date: 10/03/2026", "Rice 125.00", "Total 125.00", "Cash 200.00", "Change 75.00"]]
        result = parse_rows(rows, "printed")
        self.assertEqual(len(result["line_items"]), 1)
        self.assertEqual(result["line_items"][0]["amount"], 125.)
        fields = {field["field_name"]: field["value"] for field in result["fields"]}
        self.assertEqual(fields["control_number"], "R-123")
        self.assertEqual(fields["date"], "2026-10-03")
        self.assertEqual(fields["amount"], "125.00")

    def test_geometry_joins_separate_price_and_name_cells(self):
        words = [{"text": text, "x": x, "y": y, "height": 20, "confidence": .95} for text,x,y in [("50.00",300,12),("Pen",10,10),("Paper",10,40),("75.00",300,42)]]
        self.assertEqual([row["text"] for row in group_words(words)], ["Pen 50.00", "Paper 75.00"])

    def test_quantity_and_cost_need_explicit_matching_arithmetic(self):
        rows = [{"text": text, "confidence": .9} for text in ["Paper 2 x 50.00 100.00", "Pen 3 x 20.00 99.00", "Rice 125.00"]]
        items = parse_rows(rows, "printed")["line_items"]
        self.assertEqual((items[0]["quantity"], items[0]["unit_cost"]), (2., 50.))
        for item in items[1:]:
            self.assertIsNone(item["quantity"])
            self.assertIsNone(item["unit_cost"])

    def test_bad_mime_and_corrupt_image_are_rejected(self):
        for content,mime in [(self.image,"application/octet-stream"),(b"invalid","image/png")]:
            self.assertEqual(self.client.post("/api/ocr/extract/printed",files={"file":("scan.png",content,mime)}).status_code,400)

    def test_empty_extraction_is_not_success(self):
        service = Mock()
        service.process.return_value = parse_rows([], "printed")
        with patch("app.routers.ocr.get_ocr_service", return_value=service):
            self.assertEqual(self.client.post("/api/ocr/extract/printed", files={"file":("scan.png",self.image,"image/png")}).status_code,422)

    def test_handwriting_calls_real_processing_contract(self):
        service = Mock()
        service.process.return_value = parse_rows([{"text":"Amount: 45.00", "confidence":.9}], "handwritten")
        with patch("app.routers.ocr.get_ocr_service", return_value=service):
            response = self.client.post("/api/ocr/extract/handwritten",files={"file":("scan.png",self.image,"image/png")})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()["fields"][0]["value"],"45.00")

    def test_service_token_is_checked(self):
        with patch.dict(os.environ, {"OCR_SERVICE_TOKEN":"test-only-token"}):
            response = self.client.post("/api/ocr/extract/printed",files={"file":("scan.png",self.image,"image/png")})
            self.assertEqual(response.status_code,401)

if __name__ == "__main__":
    unittest.main()
