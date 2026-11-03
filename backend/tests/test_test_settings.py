from fakes import make_settings


def test_make_settings_ignores_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("PARSER", "rules")
    monkeypatch.setenv("LLM_MODE", "live")
    s = make_settings(tmp_path)
    assert (s.parser, s.llm_mode, s.embedder) == ("stub", "off", "minilm")
    assert s.db_path == tmp_path / "t.db"
