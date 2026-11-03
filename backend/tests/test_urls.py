from app.index.urls import entry_id, normalize_url, page_id, search_doc_id


def test_normalize_strips_tracking_www_fragment_and_sorts():
    got = normalize_url("HTTPS://www.Example.com/a/?utm_source=x&b=2&a=1#top")
    assert got == "https://example.com/a?a=1&b=2"


def test_normalize_keeps_root_slash():
    assert normalize_url("https://example.com/") == "https://example.com/"


def test_normalize_drops_click_ids():
    assert normalize_url("https://example.com/p?fbclid=1&gclid=2") == "https://example.com/p"


def test_page_id_stable_across_variants():
    assert page_id("https://www.example.com/a?utm_medium=y") == page_id("https://example.com/a")
    assert page_id("https://example.com/a").startswith("p_")


def test_search_doc_id_ignores_case_and_spaces():
    assert search_doc_id("  Cheap Flights ") == search_doc_id("cheap flights")


def test_entry_id_depends_on_time():
    a = entry_id("visit", "https://example.com", 1)
    assert a.startswith("e_") and a != entry_id("visit", "https://example.com", 2)
