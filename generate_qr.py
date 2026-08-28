#!/usr/bin/env python3
"""
Genera códigos QR permanentes para Google Sheets.
URL centralizada en GOOGLE_SHEET_URL.
"""
import qrcode
import qrcode.image.svg
from pathlib import Path

GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1OEV2za6VbPG7CHU4Pd71Nzi4smy3eizqjrLCRq7UggE/edit?usp=sharing"

ROOT = Path(__file__).parent

def generate_png():
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(GOOGLE_SHEET_URL)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img_path = ROOT / "QR-GOOGLE-SHEET.png"
    img.save(img_path)
    print(f"PNG generado: {img_path}")
    return img_path

def generate_svg():
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(GOOGLE_SHEET_URL)
    qr.make(fit=True)

    img = qr.make_image(
        image_factory=qrcode.image.svg.SvgImage,
        fill_color="black",
        back_color="white"
    )
    svg_path = ROOT / "QR-GOOGLE-SHEET.svg"
    img.save(svg_path)
    print(f"SVG generado: {svg_path}")
    return svg_path

def verify_qr(png_path):
    try:
        import cv2
        import numpy as np
        from PIL import Image
        pil_img = Image.open(png_path).convert('RGB')
        img_array = np.array(pil_img)
        detector = cv2.QRCodeDetector()
        data, vertices, _ = detector.detectAndDecode(img_array)
        if data == GOOGLE_SHEET_URL:
            print(f"✓ Validación exitosa: QR decodifica correctamente a la URL objetivo")
            return True
        else:
            print(f"✗ Error: QR decodifica a: {data}")
            print(f"  Esperado: {GOOGLE_SHEET_URL}")
            return False
    except ImportError:
        print("  (OpenCV no disponible para validación automática)")
        return None

if __name__ == "__main__":
    print(f"Generando QR para: {GOOGLE_SHEET_URL}")
    png_path = generate_png()
    svg_path = generate_svg()
    verify_qr(png_path)
    print("\n¡Completado!")