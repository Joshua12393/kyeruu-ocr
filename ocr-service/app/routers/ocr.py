"""
OCR Router - Handles document image uploads and returns extracted data.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


# ==========================================
# Response Models
# ==========================================

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class ExtractedField(BaseModel):
    field_name: str
    value: str
    confidence: float
    bounding_box: Optional[BoundingBox] = None


class LineItem(BaseModel):
    particular: str
    quantity: Optional[float] = None
    unit_cost: Optional[float] = None
    amount: float
    confidence: float


class OcrResult(BaseModel):
    pipeline: str  # "printed" or "handwritten"
    raw_text: str
    fields: list[ExtractedField]
    line_items: list[LineItem]
    overall_confidence: float


# ==========================================
# Endpoints
# ==========================================

@router.post("/extract/printed", response_model=OcrResult)
async def extract_printed_document(file: UploadFile = File(...)):
    """
    Process a printed document (e.g., retailer receipt) using
    PaddleOCR structure-aware table parsing.
    Returns extracted line items and fields with confidence scores.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # TODO: Implement PaddleOCR printed document pipeline
    # 1. Read image bytes
    # 2. Run PaddleOCR table structure recognition
    # 3. Extract line items from detected table cells
    # 4. Return structured result with confidence scores

    return OcrResult(
        pipeline="printed",
        raw_text="",
        fields=[],
        line_items=[],
        overall_confidence=0.0,
    )


@router.post("/extract/handwritten", response_model=OcrResult)
async def extract_handwritten_document(file: UploadFile = File(...)):
    """
    Process a handwritten document (e.g., AR, DV, Certificate of Expenses)
    using a vision-language model pipeline.
    Returns extracted fields with confidence scores.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # TODO: Implement handwritten document pipeline
    # 1. Read image bytes
    # 2. Run vision-language model for field extraction
    # 3. Parse structured fields (control number, date, amount, purpose)
    # 4. Return structured result with confidence scores

    return OcrResult(
        pipeline="handwritten",
        raw_text="",
        fields=[],
        line_items=[],
        overall_confidence=0.0,
    )
