export type ServiceState = "checking" | "ready" | "offline";

interface AppHeaderProps {
  service: ServiceState;
  inCourse: boolean;
  onHome: () => void;
}

const serviceLabels: Record<ServiceState, string> = {
  checking: "Connecting",
  ready: "Saved locally",
  offline: "Local service offline",
};

export function AppHeader({ service, inCourse, onHome }: AppHeaderProps) {
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
          className={!inCourse ? "nav-link nav-link--active" : "nav-link"}
          onClick={onHome}
        >
          Library
        </button>
        <div className={`service-state service-state--${service}`}>
          <span aria-hidden="true" />
          {serviceLabels[service]}
        </div>
      </nav>
    </header>
  );
}

