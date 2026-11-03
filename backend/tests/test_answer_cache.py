import re

from app.answer_cache import AnswerCache, CachedAsk
from app.schemas.api import Answer
from app.schemas.intent import Intent


def _item(n=0):
    return CachedAsk(question=f"q{n}", intent=Intent(kind="any"), results=[], template_answer=Answer(text="t", cited=[]))


def test_put_returns_opaque_id_and_get_returns_item():
    c = AnswerCache()
    ask_id = c.put(_item())
    assert re.fullmatch(r"a_[0-9a-f]{16}", ask_id)
    assert c.get(ask_id).question == "q0"


def test_unknown_id_is_none():
    assert AnswerCache().get("a_0000000000000000") is None


def test_keeps_at_most_50_evicting_oldest():
    c = AnswerCache()
    ids = [c.put(_item(i)) for i in range(51)]
    assert c.get(ids[0]) is None
    assert c.get(ids[1]).question == "q1"
    assert c.get(ids[50]).question == "q50"


def test_expires_ten_minutes_after_put():
    t = [100.0]
    c = AnswerCache(clock=lambda: t[0])
    ask_id = c.put(_item())
    t[0] = 100.0 + 599.9
    assert c.get(ask_id) is not None
    t[0] = 100.0 + 600.0
    assert c.get(ask_id) is None
