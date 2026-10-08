from app.services import progress


def test_progress_lifecycle():
    job_id = "job-123"
    workspace_id = "ws-abc"
    progress.start_job(job_id, workspace_id)

    info = progress.get_job(job_id)
    assert info is not None
    assert info["progress"] == 0
    assert info["status"] == "pending"

    progress.update_job(job_id, progress=30, status="running")
    info = progress.get_job(job_id)
    assert info["progress"] == 30
    assert info["status"] == "running"

    progress.update_job(job_id, progress=100, status="done", output="/tmp/out.png")
    info = progress.get_job(job_id)
    assert info["output"] == "/tmp/out.png"
    assert info["progress"] == 100

    progress.clear_job(job_id)
    assert progress.get_job(job_id) is None


def test_request_cancel_marks_job_and_unknown_job_returns_false():
    from app.services import progress
    progress.start_job("job-c1", "ws1")
    assert progress.is_cancel_requested("job-c1") is False
    assert progress.request_cancel("job-c1") is True
    assert progress.is_cancel_requested("job-c1") is True
    assert progress.request_cancel("no-such-job") is False


def test_cancel_check_raises_inside_progress_callback():
    import pytest
    from app.services import progress
    progress.start_job("job-c2", "ws1")
    progress.request_cancel("job-c2")
    with pytest.raises(progress.GenerationCancelled):
        progress.raise_if_cancelled("job-c2")
