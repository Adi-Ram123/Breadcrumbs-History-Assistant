from check_fixture_hashes import compute_hashes, diff_hashes


def test_detects_changed_file(tmp_path):
    (tmp_path / "a.json").write_text("[]")
    before = compute_hashes(tmp_path)
    (tmp_path / "a.json").write_text("[1]")
    assert diff_hashes(before, compute_hashes(tmp_path)) == ["changed: a.json"]


def test_detects_added_and_removed(tmp_path):
    (tmp_path / "a.json").write_text("[]")
    before = compute_hashes(tmp_path)
    (tmp_path / "a.json").unlink()
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "b.jsonl").write_text("{}")
    assert sorted(diff_hashes(before, compute_hashes(tmp_path))) == ["added: sub/b.jsonl", "removed: a.json"]


def test_ignores_hashes_file(tmp_path):
    (tmp_path / "HASHES").write_text("whatever")
    assert compute_hashes(tmp_path) == {}
