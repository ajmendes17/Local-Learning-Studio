import { useEffect, useState } from "react";
import type { HealthResponse } from "@local-learning-studio/contracts";

type ServiceState =
  | { kind: "checking"; label: "Checking local service" }
  | { kind: "ready"; label: "Local service ready" }
  | { kind: "offline"; label: "Local service unavailable" };

const nextSteps = [
  {
    number: "01",
    title: "Add course material",
    body: "Import notes, readings, and slides with source locations preserved.",
  },
  {
    number: "02",
    title: "Map what matters",
    body: "Turn the course into concepts, prerequisites, and a practical plan.",
  },
  {
    number: "03",
    title: "Practice with purpose",
    body: "Study, solve, and review based on demonstrated understanding.",
  },
];

export function App() {
  const [service, setService] = useState<ServiceState>({
    kind: "checking",
    label: "Checking local service",
  });

  useEffect(() => {
    const controller = new AbortController();

    async function checkService() {
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const health = (await response.json()) as HealthResponse;
        setService(
          health.status === "ok"
            ? { kind: "ready", label: "Local service ready" }
            : { kind: "offline", label: "Local service unavailable" },
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setService({
            kind: "offline",
            label: "Local service unavailable",
          });
        }
      }
    }

    void checkService();
    return () => controller.abort();
  }, []);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Local Learning Studio home">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>Local Learning Studio</span>
        </a>
        <div className={`service-state service-state--${service.kind}`}>
          <span aria-hidden="true" />
          {service.label}
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Your material. Your pace. Your progress.</p>
        <h1>Build understanding that lasts.</h1>
        <p className="hero-copy">
          A private learning workspace that turns your own course material into
          focused lessons, useful practice, and an adaptive plan.
        </p>
        <button type="button" disabled>
          Add your first course
          <span>Planned</span>
        </button>
      </section>

      <section className="path" aria-labelledby="path-heading">
        <div className="section-heading">
          <p>How it will work</p>
          <h2 id="path-heading">A clear path from source to mastery.</h2>
        </div>
        <div className="step-grid">
          {nextSteps.map((step) => (
            <article key={step.number}>
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <p>Foundation build · Course ingestion is the next milestone.</p>
        <span>Local-first by design</span>
      </footer>
    </main>
  );
}

