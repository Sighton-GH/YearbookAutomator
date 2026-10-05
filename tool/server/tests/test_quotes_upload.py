import importlib
import json


def _setup(tmp_path, monkeypatch, session_id):
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
            session_id=session_id,
        ).workspace_id
        assert workspace_id
        headers = {"X-License-Key": key, "X-Device-Id": "dev1"}
        return client, workspace_id, headers
    except Exception:
        client.close()
        raise


def _post_quotes(client, workspace_id, headers, csv_bytes, people, advanced="true"):
    files = {"quotes_spreadsheet": ("quotes.csv", csv_bytes, "text/csv")}
    data = {
        "workspace_id": workspace_id,
        "people_json": json.dumps(people),
        "advanced_name_match": advanced,
    }
    return client.post(
        "/api/mapping/upload-quotes-spreadsheet",
        files=files,
        data=data,
        headers=headers,
    )


def test_explicit_quote_column_keeps_real_quotes(tmp_path, monkeypatch):
    client, workspace_id, headers = _setup(tmp_path, monkeypatch, "quotes-real")
    try:
        people = [
            {"index": 1, "first_name": "Anna", "last_name": "Lee"},
            {"index": 2, "first_name": "Bob", "last_name": "Ray"},
            {"index": 3, "first_name": "Cat", "last_name": "Day"},
            {"index": 4, "first_name": "Dan", "last_name": "Fox"},
        ]
        csv_bytes = (
            "First Name,Last Name,Quote\n"
            "Anna,Lee,Finally.\n"
            "Bob,Ray,yolo\n"
            "Cat,Day,Isaiah 58:9\n"
            "Dan,Fox,永远年轻\n"
        ).encode("utf-8")
        resp = _post_quotes(client, workspace_id, headers, csv_bytes, people)
        assert resp.status_code == 200, resp.text
        by_index = {p["index"]: p for p in resp.json()["people"]}
        assert by_index[1]["quote"] == "Finally."
        assert by_index[2]["quote"] == "yolo"
        assert by_index[3]["quote"] == "Isaiah 58:9"
        assert by_index[4]["quote"] == "永远年轻"
    finally:
        client.close()


def test_explicit_quote_column_rejects_links_and_emails(tmp_path, monkeypatch):
    client, workspace_id, headers = _setup(tmp_path, monkeypatch, "quotes-links")
    try:
        people = [
            {"index": 1, "first_name": "Anna", "last_name": "Lee"},
            {"index": 2, "first_name": "Bob", "last_name": "Ray"},
        ]
        csv_bytes = (
            "First Name,Last Name,Quote\n"
            "Anna,Lee,https://example.com/x\n"
            "Bob,Ray,someone@school.ca\n"
        ).encode("utf-8")
        resp = _post_quotes(client, workspace_id, headers, csv_bytes, people)
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        by_index = {p["index"]: p for p in payload["people"]}
        assert not by_index[1]["quote"]
        assert not by_index[2]["quote"]
        warnings = payload.get("warnings", [])
        assert any("Row 2" in w and "looks like a link or email" in w for w in warnings)
    finally:
        client.close()


def test_quotes_sheet_without_name_column_warns(tmp_path, monkeypatch):
    client, workspace_id, headers = _setup(tmp_path, monkeypatch, "quotes-noname")
    try:
        people = [{"index": 1, "first_name": "Anna", "last_name": "Lee"}]
        csv_bytes = "Quote\nDream big and shine on.\n".encode("utf-8")
        resp = _post_quotes(client, workspace_id, headers, csv_bytes, people)
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        assert payload["people"][0]["quote"] is None
        assert "no student name column" in payload["warnings"][0]
    finally:
        client.close()


def test_quotes_sheet_with_no_matches_warns(tmp_path, monkeypatch):
    client, workspace_id, headers = _setup(tmp_path, monkeypatch, "quotes-nomatch")
    try:
        people = [{"index": 1, "first_name": "Anna", "last_name": "Lee"}]
        csv_bytes = (
            "First Name,Last Name,Quote\n"
            "Nobody,Here,Dream big and shine on.\n"
        ).encode("utf-8")
        resp = _post_quotes(client, workspace_id, headers, csv_bytes, people)
        assert resp.status_code == 200, resp.text
        assert any("No rows matched" in w for w in resp.json().get("warnings", []))
    finally:
        client.close()


def test_explicit_quote_column_treats_placeholders_as_no_quote(tmp_path, monkeypatch):
    client, workspace_id, headers = _setup(tmp_path, monkeypatch, "quotes-placeholders")
    try:
        people = [
            {"index": 1, "first_name": "Ann", "last_name": "Lee"},
            {"index": 2, "first_name": "Ben", "last_name": "Ray"},
            {"index": 3, "first_name": "Cat", "last_name": "Day"},
            {"index": 4, "first_name": "Dan", "last_name": "Fox"},
            {"index": 5, "first_name": "Eve", "last_name": "Hill"},
            {"index": 6, "first_name": "Fin", "last_name": "Cole"},
            {"index": 7, "first_name": "Gia", "last_name": "Wood"},
            {"index": 8, "first_name": "Hal", "last_name": "Bell"},
            {"index": 9, "first_name": "Ivy", "last_name": "Lane"},
            {"index": 10, "first_name": "Jay", "last_name": "Moss"},
            {"index": 11, "first_name": "Kim", "last_name": "Ross"},
            {"index": 12, "first_name": "Lou", "last_name": "Page"},
            {"index": 13, "first_name": "Max", "last_name": "Reed"},
            {"index": 14, "first_name": "Nia", "last_name": "Stone"},
        ]
        csv_bytes = (
            "First Name,Last Name,Quote\n"
            "Ann,Lee,REJECTED\n"
            "Ben,Ray,rejected\n"
            "Cat,Day, Rejected. \n"
            "Dan,Fox,N/A\n"
            "Eve,Hill,n/a\n"
            "Fin,Cole,none\n"
            "Gia,Wood,-\n"
            "Hal,Bell,\u2014\n"
            "Ivy,Lane,TBD\n"
            "Jay,Moss,no quote\n"
            "Kim,Ross,x\n"
            "Lou,Page,Finally.\n"
            "Max,Reed,yolo\n"
            "Nia,Stone,Isaiah 58:9\n"
        ).encode("utf-8")
        resp = _post_quotes(client, workspace_id, headers, csv_bytes, people)
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        by_index = {p["index"]: p for p in payload["people"]}
        for idx in range(1, 12):
            assert not by_index[idx]["quote"], by_index[idx]
        warnings = payload.get("warnings", [])
        for row_no in range(2, 13):
            assert any(f"Row {row_no}" in w and "placeholder" in w for w in warnings), warnings
        assert by_index[12]["quote"] == "Finally."
        assert by_index[13]["quote"] == "yolo"
        assert by_index[14]["quote"] == "Isaiah 58:9"
    finally:
        client.close()


def test_advanced_name_match_false_is_honoured(tmp_path, monkeypatch):
    client, workspace_id, headers = _setup(tmp_path, monkeypatch, "quotes-advfalse")
    try:
        people = [{"index": 1, "first_name": "Anna", "last_name": "Lee"}]
        csv_bytes = (
            "First Name,Last Name,Quote\n"
            "Anna,Lee,Dream big and shine on.\n"
        ).encode("utf-8")
        resp = _post_quotes(client, workspace_id, headers, csv_bytes, people, advanced="false")
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        assert payload["people"][0]["quote"] is None
        warnings = payload.get("warnings", [])
        assert any("no student matched the name" in w for w in warnings)
    finally:
        client.close()
