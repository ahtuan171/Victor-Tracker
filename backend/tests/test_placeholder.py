"""Keeps the Phase 1 suite non-empty.

pytest exits 5 on "no tests collected", which the CI `test` stage reads as a failure. There is
nothing real to assert until the schema and app exist, so this holds the exit code at 0 in the
meantime.

Delete this file when T017 lands `conftest.py` and the first real tests alongside it.
"""


def test_python_version_matches_the_locked_default() -> None:
    """tech-defaults.md pins Python 3.13. A runner on 3.12 would pass tests that lie."""
    import sys

    assert sys.version_info[:2] == (3, 13)
