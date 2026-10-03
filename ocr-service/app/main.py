"""
CCIS OMS Finance Module - OCR Microservice
FastAPI application entry point.

This service handles:
  - Printed document OCR with geometry-based financial parsing
  - Handwritten document OCR using the same PaddleOCR recognizer
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import ocr

app = FastAPI(
    title="CCIS OMS - OCR Microservice",
    description="PaddleOCR-based document extraction service for the Finance Module",
    version="0.1.0",
)

# Allow requests from the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr.router, prefix="/api/ocr", tags=["OCR"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ocr-microservice"}
