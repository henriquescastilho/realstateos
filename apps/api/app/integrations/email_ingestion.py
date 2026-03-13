def is_bill_attachment(filename: str) -> bool:
    return filename.lower().endswith(".pdf")
