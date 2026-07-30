import { useCallback, useEffect, useState } from "react";
import type {
  CourseDetail,
  CourseSummary,
  CreateCourseRequest,
  HealthResponse,
  MaterialKind,
} from "@local-learning-studio/contracts";
import { AppHeader, type ServiceState } from "./components/AppHeader";
import { createCourse, getCourse, listCourses, uploadMaterial } from "./lib/api";
import { CoursePage } from "./views/CoursePage";
import { HomePage } from "./views/HomePage";
import { InfoPage } from "./views/InfoPage";

type AppRoute =
  | { kind: "library" }
  | { kind: "info" }
  | { kind: "course"; courseId: string };

function routeFromPath(): AppRoute {
  if (window.location.pathname === "/how-it-works") return { kind: "info" };
  const match = window.location.pathname.match(/^\/courses\/([^/]+)$/);
  return match?.[1]
    ? { kind: "course", courseId: match[1] }
    : { kind: "library" };
}

export function App() {
  const [service, setService] = useState<ServiceState>("checking");
  const [route, setRoute] = useState<AppRoute>(routeFromPath);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    try {
      setError(null);
      const response = await listCourses();
      setCourses(response.courses);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCourse = useCallback(async (courseId: string) => {
    try {
      setError(null);
      setLoading(true);
      setSelectedCourse(await getCourse(courseId));
    } catch (requestError) {
      setError((requestError as Error).message);
      setSelectedCourse(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) throw new Error("Service unavailable");
        return (await response.json()) as HealthResponse;
      })
      .then((health) => setService(health.status === "ok" ? "ready" : "offline"))
      .catch(() => setService("offline"));

    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (route.kind === "course") {
      void loadCourse(route.courseId);
    } else {
      setSelectedCourse(null);
      setLoading(false);
    }
  }, [loadCourse, route]);

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRoute(routeFromPath());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCreate(input: CreateCourseRequest) {
    const course = await createCourse(input);
    setCourses((current) => [course, ...current]);
    navigate(`/courses/${course.id}`);
  }

  async function handleUpload(file: File, kind: MaterialKind) {
    if (route.kind !== "course") return;
    await uploadMaterial(route.courseId, file, kind);
    await Promise.all([loadCourse(route.courseId), loadLibrary()]);
  }

  const activePage =
    route.kind === "course" ? "course" : route.kind === "info" ? "info" : "library";

  return (
    <div className="app-shell">
      <AppHeader
        service={service}
        activePage={activePage}
        onHome={() => navigate("/")}
        onInfo={() => navigate("/how-it-works")}
      />
      {route.kind === "course" ? (
        <CoursePage
          course={selectedCourse}
          loading={loading}
          error={error}
          onBack={() => navigate("/")}
          onUpload={handleUpload}
        />
      ) : route.kind === "info" ? (
        <InfoPage onStart={() => navigate("/")} />
      ) : (
        <HomePage
          courses={courses}
          loading={loading}
          error={error}
          onCreate={handleCreate}
          onOpen={(courseId) => navigate(`/courses/${courseId}`)}
        />
      )}
    </div>
  );
}

