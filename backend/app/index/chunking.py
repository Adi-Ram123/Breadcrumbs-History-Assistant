"""Split page text into overlapping chunks for embedding.

The first chunk of every page is `title | url` (the format the retriever is trained
on, per README). If Aditya's retriever expects something else, change it here and
re-embed (ml/CLAUDE.md Q&A item 3).
"""

from app.index.urls import normalize_url


def chunk_text(text: str | None, max_chars: int = 1000, overlap: int = 200) -> list[str]:
    if not text or not text.strip():
        return []
    text = " ".join(text.split())
    n = len(text)
    chunks: list[str] = []
    start = 0
    while start < n:
        end = min(start + max_chars, n)
        if end < n:
            cut = text.rfind(" ", start, end)
            if cut > start:
                end = cut
        chunks.append(text[start:end].strip())
        if end >= n:
            break
        next_start = max(end - overlap, start + 1)
        space = text.find(" ", next_start, end)
        start = space + 1 if space != -1 else end
    return chunks


def display_url(url: str) -> str:
    return normalize_url(url).split("://", 1)[-1]


def doc_chunks(title: str, url: str, text: str | None) -> list[str]:
    return [f"{title} | {display_url(url)}"] + chunk_text(text)
