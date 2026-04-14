import re
from bs4 import BeautifulSoup


def clean_text(text: str) -> str | None:
    """Strip HTML, normalize whitespace, return None if content is too short."""
    if not text:
        return None
    # Strip HTML tags
    text = BeautifulSoup(text, "html.parser").get_text()
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Drop low-signal reviews
    if len(text) < 20:
        return None
    return text
