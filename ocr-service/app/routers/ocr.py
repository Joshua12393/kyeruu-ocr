"""Validated upload endpoints backed by PaddleOCR."""
import asyncio
import io
import os
import secrets
import logging
from typing import Literal
from fastapi import APIRouter, UploadFile, File, HTTPException, Header
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError
from app.services.paddle_ocr_service import get_ocr_service

router = APIRouter()
MAX_BYTES = 10 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000
processing = asyncio.Semaphore(1)

class ExtractedField(BaseModel):
    field_name: str
    value: str
    confidence: float = Field(ge=0, le=1)

class LineItem(BaseModel):
    particular: str
    quantity: float | None = None
    unit_cost: float | None = None
    amount: float
    confidence: float = Field(ge=0, le=1)

class OcrResult(BaseModel):
    engine: str | None = None
    pipeline: Literal["printed", "handwritten"]
    raw_text: str
    fields: list[ExtractedField]
    line_items: list[LineItem]
    overall_confidence: float = Field(ge=0, le=1)

async def extract(file: UploadFile, pipeline: str, token: str | None):
    required_token = os.getenv("OCR_SERVICE_TOKEN")
    if required_token and not secrets.compare_digest(required_token, token or ""):
        raise HTTPException(status_code=401, detail="Invalid OCR service token")
    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(status_code=400, detail="Upload a PNG, JPEG, or WebP image")
    chunks, size = [], 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Image exceeds 10 MB")
        chunks.append(chunk)
    try:
        with Image.open(io.BytesIO(b"".join(chunks))) as opened:
            if opened.width * opened.height > Image.MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=413, detail="Image dimensions are too large")
            if Image.MIME.get(opened.format) != file.content_type:
                raise HTTPException(status_code=400, detail="Image content does not match its MIME type")
            opened.load()
            image = opened.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail="Invalid image")
    try:
        async with processing:
            result = await asyncio.to_thread(lambda: get_ocr_service().process(image, pipeline))
    except Exception:
        logging.exception("OCR inference failed")
        raise HTTPException(status_code=503, detail="OCR engine is unavailable")
    if not result["raw_text"].strip():
        raise HTTPException(status_code=422, detail="No readable text found")
    return result

@router.post("/extract/printed", response_model=OcrResult)
async def extract_printed_document(file: UploadFile = File(...), x_ocr_token: str | None = Header(default=None)):
    return await extract(file, "printed", x_ocr_token)

@router.post("/extract/handwritten", response_model=OcrResult)
async def extract_handwritten_document(file: UploadFile = File(...), x_ocr_token: str | None = Header(default=None)):
    return await extract(file, "handwritten", x_ocr_token)
