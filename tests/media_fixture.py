"""Small, valid two-page PDF used by browser fixtures."""
def sample_pdf():
    drawing = b"BT /F1 22 Tf 64 700 Td (Apercu PDF Workspace) Tj ET"
    second = b"BT /F1 22 Tf 64 700 Td (Page deux Workspace) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(drawing)).encode() + b" >>\nstream\n" + drawing + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
        b"<< /Length " + str(len(second)).encode() + b" >>\nstream\n" + second + b"\nendstream",
    ]
    chunks = [b"%PDF-1.4\n"]
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(sum(map(len, chunks)))
        chunks.append(str(number).encode() + b" 0 obj\n" + obj + b"\nendobj\n")
    xref = sum(map(len, chunks))
    chunks.append(b"xref\n0 8\n0000000000 65535 f \n" + b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:]))
    chunks.append(b"trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n" + str(xref).encode() + b"\n%%EOF\n")
    return b"".join(chunks)

