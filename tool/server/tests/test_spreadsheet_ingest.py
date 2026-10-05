import io
from uuid import uuid4

import pytest

from app.services import spreadsheet as s


@pytest.fixture(autouse=True)
def _data(tmp_path, monkeypatch):
    from app.services import storage

    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    (tmp_path / "data").mkdir()


def names(csv_bytes, filename="r.csv"):
    r = s.ingest_spreadsheet(uuid4().hex, io.BytesIO(csv_bytes), filename, None)
    return [(p.index, p.first_name, p.last_name) for p in r.people]


def test_blank_rows_are_dropped_and_indices_stay_contiguous():
    assert names(b"First Name,Last Name\nJohn,Doe\n,\n  ,  \nJane,Smith\n") == [
        (1, "John", "Doe"),
        (2, "Jane", "Smith"),
    ]


@pytest.mark.parametrize(
    "header",
    [
        "first_name,last_name",
        "FirstName,LastName",
        "First,Last",
        "Given Name,Surname",
        "FIRST NAME,LAST NAME",
        "Student First Name,Student Last Name",
    ],
)
def test_common_header_variants(header):
    assert names(f"{header}\nJohn,Doe\n".encode()) == [(1, "John", "Doe")]


def test_single_full_name_column_is_split_on_last_space():
    assert names(b"Full Name\nMary Ann Lee\nCher\n") == [
        (1, "Mary Ann", "Lee"),
        (2, "Cher", ""),
    ]


def test_windows_1252_csv_with_accents():
    assert names("First Name,Last Name\nJos\xe9,Garc\xeda\n".encode("cp1252")) == [
        (1, "Jos\xe9", "Garc\xeda"),
    ]


def test_missing_name_columns_raises_roster_format_error_with_help():
    with pytest.raises(s.RosterFormatError) as exc:
        names(b"Student,Grade\nJohn,12\n")
    assert "First Name" in str(exc.value) and "Last Name" in str(exc.value)


def test_empty_file_raises_roster_format_error():
    with pytest.raises(s.RosterFormatError):
        names(b"")


def test_ingest_route_maps_bad_headers_to_400(tmp_path, monkeypatch):
    import importlib

    monkeypatch.setenv("YMGA_LICENSE_STORE_DIR", str(tmp_path / "licenses"))
    monkeypatch.setenv("YMGA_LICENSE_SECRET", "test-secret")
    monkeypatch.setenv("YMGA_CLEAR_WORKSPACES_ON_STARTUP", "false")

    from app import main as main_mod

    importlib.reload(main_mod)

    from app.services import storage

    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    storage.BASE_DATA.mkdir(parents=True, exist_ok=True)

    from live_test_client import LiveTestClient

    client = LiveTestClient(main_mod.app)
    try:
        from app.services import licensing
        from app.services.workspace_registry import resolve_workspace

        key = licensing.create_license(license_type="commercial", note="test")
        workspace_id = resolve_workspace(
            license_key=key,
            license_type="commercial",
            device_id="dev1",
            session_id="session-ingest-400",
        ).workspace_id

        files = {
            "spreadsheet": ("r.csv", b"Student,Grade\nJohn,12\n", "text/csv"),
        }
        data = {"workspace_id": workspace_id}
        headers = {"X-License-Key": key, "X-Device-Id": "dev1"}
        resp = client.post("/api/mapping/ingest", files=files, data=data, headers=headers)
        assert resp.status_code == 400
        assert "First Name" in resp.json()["detail"]
    finally:
        client.close()
