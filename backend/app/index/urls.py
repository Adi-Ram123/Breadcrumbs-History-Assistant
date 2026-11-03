"""URL normalization and stable ids. One implementation shared by /ingest and the seed loader."""

import hashlib
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING_PARAMS = {"fbclid", "gclid"}


def normalize_url(url: str) -> str:
    parts = urlsplit(url.strip())
    scheme = parts.scheme.lower()
    host = parts.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    path = parts.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/") or "/"
    params = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in TRACKING_PARAMS
    ]
    query = urlencode(sorted(params))
    return urlunsplit((scheme, host, path, query, ""))


def _h(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


def page_id(url: str) -> str:
    return "p_" + _h(normalize_url(url))


def search_doc_id(query: str) -> str:
    return "s_" + _h(query.strip().lower())


def entry_id(kind: str, url: str, visit_time_ms: int) -> str:
    return "e_" + _h(f"{kind}|{normalize_url(url)}|{visit_time_ms}")
