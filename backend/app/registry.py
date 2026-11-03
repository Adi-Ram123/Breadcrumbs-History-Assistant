"""Pick port implementations by the names in backend/.env."""

from importlib import import_module

from app.ports import AnswerWriter, Embedder, Parser
from app.stubs import MiniLMEmbedder, StubParser, TemplateAnswerWriter

ML_PARSERS = {
    "rules": "breadcrumbs_ml.runtime.parser_rules:RulesParser",
    "llm": "breadcrumbs_ml.runtime.parser_llm:LLMParser",
    "tagger": "breadcrumbs_ml.runtime.parser_tagger:TaggerParser",
}


def _load(target: str):
    module, _, attr = target.partition(":")
    return getattr(import_module(module), attr)


def build_parser(name: str) -> Parser:
    if name == "stub":
        return StubParser()
    if name in ML_PARSERS:
        return _load(ML_PARSERS[name])()
    raise ValueError(f"unknown PARSER {name!r}; choose one of: stub, {', '.join(ML_PARSERS)}")


def build_embedder(name: str) -> Embedder:
    if name == "minilm":
        return MiniLMEmbedder()
    return _load("breadcrumbs_ml.runtime.embedder:load_embedder")(name)


def build_answer_writer(llm_mode: str) -> AnswerWriter:
    if llm_mode == "off":
        return TemplateAnswerWriter()
    return _load("breadcrumbs_ml.runtime.answer_writer:LLMAnswerWriter")(mode=llm_mode)
