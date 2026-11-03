from app.schemas.api import Answer
from app.verifier import verify


def test_rejects_uncited_id():
    assert verify(Answer(text="You saw X [1].", cited=["e_x"]), ["e_a"]) is None


def test_rejects_duplicate_citation():
    assert verify(Answer(text="X", cited=["e_a", "e_a"]), ["e_a"]) is None


def test_accepts_valid():
    a = Answer(text="You read A [1].", cited=["e_a"])
    assert verify(a, ["e_a", "e_b"]) == a


def test_rejects_blank_text():
    assert verify(Answer(text="  ", cited=[]), ["e_a"]) is None


def test_rejects_answer_without_citation():
    # Mutant 07 shape: a claim with no source link.
    assert verify(Answer(text="You searched 'dune showtimes' Monday.", cited=[]), ["e_a"]) is None
