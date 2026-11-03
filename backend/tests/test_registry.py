import pytest

from app.ports import AnswerWriter, Embedder, Parser
from app.registry import build_parser
from app.stubs import MiniLMEmbedder, StubParser, TemplateAnswerWriter


def test_stubs_satisfy_ports():
    assert isinstance(StubParser(), Parser)
    assert isinstance(MiniLMEmbedder(), Embedder)
    assert isinstance(TemplateAnswerWriter(), AnswerWriter)


def test_unknown_parser_raises():
    with pytest.raises(ValueError, match="stub"):
        build_parser("nope")


def test_health_reports_embedder_version(client):
    assert client.get("/health").json()["embedder_version"] == "fake-v1"
