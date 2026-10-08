# Regroup fix, separate from HEAD evidence

Base: 8c43cee02323a4ef77fd2864521bc0208493f309. No push or commit.

Removes overlapping duplicate portrait slots before the existing spread cap. Keeps earliest original object in each nearby group so LayoutTab's original-index map remaps surviving pins, and layout history keeps slots/pins together. Distinct nearby slots remain ordered normally. Overlap threshold is intersection / larger portrait area >= 0.4 inside the existing proximity group; covers default 20 px duplicate even for small slots.

Integration tests cover both placement modes, surviving pinned slots, undo restoring duplicate and redo removing it. Existing distinct-slot cap and removed-pin cases remain passing. Generated fixtures updated.

Checks on 8c43cee0 plus patch: 5/5 layout helper suites pass; TypeScript + Vite build passes. Actual UI duplicate, regroup, undo and redo captured in 19-patched-* screenshots. Final output generated on patched frontend and actual backend. Before: 13-regroup-output.png has overlapping Ana/Émile. After: 19-patched-regroup-output.png has separated portraits and names. UI pins not independently set in this last render; pin preservation is exercised by integration tests, not claimed as UI evidence.
