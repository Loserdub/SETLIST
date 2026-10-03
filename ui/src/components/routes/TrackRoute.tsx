import { TrackView } from '../../features/track';
import { OverridePanel } from '../../features/track/overrides';

export function TrackRoute() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <TrackView />
      </div>
      <OverridePanel />
    </div>
  );
}

export default TrackRoute;

