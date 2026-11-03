from app.index.chunking import chunk_text, doc_chunks


def test_chunk_none_and_blank():
    assert chunk_text(None) == []
    assert chunk_text("   \n ") == []


def test_chunks_bounded_cover_text_and_overlap():
    words = [f"w{i:04d}" for i in range(500)]  # 500 * 5 chars + spaces ~ 3000 chars
    text = " ".join(words)
    chunks = chunk_text(text, max_chars=1000, overlap=200)
    assert len(chunks) >= 3
    assert all(len(c) <= 1000 for c in chunks)
    joined = " ".join(chunks)
    assert all(w in joined for w in words)
    # consecutive chunks share some words
    for a, b in zip(chunks, chunks[1:]):
        assert set(a.split()[-10:]) & set(b.split()[:40])


def test_doc_chunks_title_url_first():
    assert doc_chunks("T", "https://rtings.com/laptop", None) == ["T | rtings.com/laptop"]
    assert doc_chunks("T", "https://www.rtings.com/laptop", "body text")[1:] == ["body text"]
