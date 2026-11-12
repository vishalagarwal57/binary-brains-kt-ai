from PyPDF2 import PdfReader

def extract_text(pdf_path):

    reader = PdfReader(pdf_path)

    text = ""

    for page in reader.pages:
        content = page.extract_text()

        if content:
            text += content

    return text