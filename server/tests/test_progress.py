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
