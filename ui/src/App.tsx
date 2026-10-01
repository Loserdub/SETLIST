import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';

export function App() {
  const { pingResult, isLoading, error, fetchPing } = useAppStore();

  useEffect(() => {
    void fetchPing();
  }, [fetchPing]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl text-center space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          DJ Set Assistant
        </h1>
        <p className="text-sm text-slate-400">
          Tauri 2 backend ping verification
        </p>

        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
            Backend Response
          </div>
          <div className="text-lg font-mono font-semibold text-emerald-400 min-h-[1.75rem] flex items-center justify-center">
            {isLoading ? (
              <span className="text-slate-400">Pinging...</span>
            ) : error ? (
              <span className="text-rose-400">{error}</span>
            ) : (
              <span data-testid="ping-result">{pingResult ?? 'Waiting...'}</span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void fetchPing()}
          disabled={isLoading}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors cursor-pointer"
        >
          Ping Backend
        </button>
      </div>
    </main>
  );
}

export default App;
