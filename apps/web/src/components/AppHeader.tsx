export type ServiceState = "checking" | "ready" | "offline";
export type ActivePage = "library" | "hand-tracking" | "info" | "course";

interface AppHeaderProps {
  service: ServiceState;
  activePage: ActivePage;
  onHome: () => void;
  onHandTracking: () => void;
  onInfo: () => void;
}

const serviceLabels: Record<ServiceState, string> = {
  checking: "Connecting",
  ready: "Saved locally",
  offline: "Local service offline",
};

export function AppHeader({
  service,
  activePage,
  onHome,
  onHandTracking,
  onInfo,
}: AppHeaderProps) {
  return (
    <header className="site-header">
      <button
        className="brand"
        type="button"
        onClick={onHome}
        aria-label="Go to course library"
      >
        <span className="brand-mark" aria-hidden="true">
          L
        </span>
        <span>Local Learning Studio</span>
      </button>
      <nav aria-label="Primary navigation">
        <button
          type="button"
          className={activePage === "hand-tracking" ? "nav-link nav-link--active" : "nav-link"}
          onClick={onHandTracking}
        >
          Hand demo
        </button>
        <button
          type="button"
          className={
            activePage === "library" ? "nav-link nav-link--active" : "nav-link"
          }
          onClick={onHome}
        >
          Library
        </button>
        <button
          type="button"
          className={
            activePage === "info" ? "nav-link nav-link--active" : "nav-link"
          }
          onClick={onInfo}
        >
          How it works
        </button>
        <div className={`service-state service-state--${service}`}>
          <span aria-hidden="true" />
          <span className="service-state__label">{serviceLabels[service]}</span>
        </div>
      </nav>
    </header>
  );
}
