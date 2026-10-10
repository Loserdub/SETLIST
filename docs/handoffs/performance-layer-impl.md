# performance-layer-impl Add Performance Layer Flow
Status: done
Changed:
- `ui/src/store/types.ts`
- `ui/src/store/slices/uiSlice.ts`
- `ui/src/App.tsx`
- `ui/src/components/Sidebar.tsx`
Added:
- `ui/src/components/routes/PerformanceFlowRoute.tsx`
- `ui/src/features/performance-flow/PerformanceFlowView.tsx`
- `ui/src/features/performance-flow/PreFlightView.tsx`
Added deps: none
Public API: Added `performance` route to `Route` and `performancePhase`/`setPerformancePhase` to `UiSlice`
Tests: Existing UI tests will run against this.
Known gaps: none
Needs from others: none
