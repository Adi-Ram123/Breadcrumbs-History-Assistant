from app.ports import AnswerWriter, LLMClient, Parser
from app.registry import build_parser
from breadcrumbs_ml.runtime.answer_writer import LLMAnswerWriter
from breadcrumbs_ml.runtime.llm_client import LocalLLMClient
from breadcrumbs_ml.runtime.parser_llm import LLMParser
from breadcrumbs_ml.runtime.parser_rules import RulesParser
from breadcrumbs_ml.runtime.parser_tagger import TaggerParser


def test_runtime_classes_satisfy_ports():
    assert isinstance(RulesParser(), Parser)
    assert isinstance(LLMParser(), Parser)
    assert isinstance(TaggerParser(), Parser)
    assert isinstance(LLMAnswerWriter("live"), AnswerWriter)
    assert isinstance(LocalLLMClient("replay"), LLMClient)


def test_registry_resolves_ml_parsers():
    assert build_parser("rules").name == "rules"
    assert build_parser("tagger").name == "tagger"
