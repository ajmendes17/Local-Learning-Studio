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

function courseIdFromPath() {
  const match = window.location.pathname.match(/^\/courses\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function App() {
  const [service, setService] = useState<ServiceState>("checking");
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseDetail | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState(courseIdFromPath);
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
    if (selectedCourseId) {
      void loadCourse(selectedCourseId);
    } else {
      setSelectedCourse(null);
      void loadLibrary();
    }
  }, [loadCourse, loadLibrary, selectedCourseId]);

  useEffect(() => {
    const handlePopState = () => setSelectedCourseId(courseIdFromPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setSelectedCourseId(courseIdFromPath());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCreate(input: CreateCourseRequest) {
    const course = await createCourse(input);
    setCourses((current) => [course, ...current]);
    navigate(`/courses/${course.id}`);
  }

  async function handleUpload(file: File, kind: MaterialKind) {
    if (!selectedCourseId) return;
    await uploadMaterial(selectedCourseId, file, kind);
    await Promise.all([loadCourse(selectedCourseId), loadLibrary()]);
  }

  return (
    <div className="app-shell">
      <AppHeader
        service={service}
        onHome={() => navigate("/")}
        inCourse={Boolean(selectedCourseId)}
      />
      {selectedCourseId ? (
        <CoursePage
          course={selectedCourse}
          loading={loading}
          error={error}
          onBack={() => navigate("/")}
          onUpload={handleUpload}
        />
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

