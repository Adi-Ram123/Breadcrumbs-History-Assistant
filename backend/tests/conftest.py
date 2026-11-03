import pytest
from fastapi.testclient import TestClient

from fakes import FakeEmbedder, make_settings

from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture
def embedder():
    return FakeEmbedder()


@pytest.fixture
def client(settings, embedder):
    with TestClient(create_app(settings, embedder=embedder)) as c:
        yield c
