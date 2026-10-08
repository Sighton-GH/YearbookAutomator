from app.services import progress

def test_warnings_are_isolated_and_deduplicated():
    progress.start_job('fictional-a', 'fictional')
    progress.start_job('fictional-b', 'fictional-two')
    progress.append_warning('fictional-a', 'A face was not found; the photo was centred.')
    progress.append_warning('fictional-a', 'A face was not found; the photo was centred.')
    assert progress.get_job('fictional-a')['warnings'] == ['A face was not found; the photo was centred.']
    assert progress.get_job('fictional-b')['warnings'] == []
    progress.clear_job('fictional-a')
    progress.clear_job('fictional-b')
