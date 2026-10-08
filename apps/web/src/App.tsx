import { useCallback, useEffect, useState } from "react";
import type {
  CodexStatusResponse,
  CourseDetail,
  CourseLearningArtifactsResponse,
  CourseSummary,
  CreateCourseRequest,
  HealthResponse,
  MaterialKind,
} from "@local-learning-studio/contracts";
import { AppHeader, type ServiceState } from "./components/AppHeader";
import type { LearningAction } from "./components/CourseMapPanel";
import {
  acceptCourseMap,
  classifyCourseSources,
  createCourse,
  generateCourseMap,
  getCodexStatus,
  getCourse,
  getLearningArtifacts,
  listCourses,
  uploadMaterial,
} from "./lib/api";
import { CoursePage } from "./views/CoursePage";
import { HomePage } from "./views/HomePage";
import { InfoPage } from "./views/InfoPage";
import { HandTrackingPage } from "./views/HandTrackingPage";

type AppRoute =
  | { kind: "library" }
  | { kind: "hand-tracking" }
  | { kind: "info" }
  | { kind: "course"; courseId: string };

function routeFromPath(): AppRoute {
  if (window.location.pathname === "/hand-tracking") return { kind: "hand-tracking" };
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
  const [artifacts, setArtifacts] =
    useState<CourseLearningArtifactsResponse | null>(null);
  const [codex, setCodex] = useState<CodexStatusResponse | null>(null);
  const [learningAction, setLearningAction] = useState<LearningAction>(null);
  const [learningError, setLearningError] = useState<string | null>(null);
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
      const [course, learningArtifacts, codexStatus] = await Promise.all([
        getCourse(courseId),
        getLearningArtifacts(courseId),
        getCodexStatus().catch(
          (): CodexStatusResponse => ({
            installed: false,
            authenticated: false,
            ready: false,
            version: null,
            detail: "The local Codex status check failed.",
          }),
        ),
      ]);
      setSelectedCourse(course);
      setArtifacts(learningArtifacts);
      setCodex(codexStatus);
    } catch (requestError) {
      setError((requestError as Error).message);
      setSelectedCourse(null);
      setArtifacts(null);
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
      setArtifacts(null);
      setLearningError(null);
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

  async function refreshLearningArtifacts(courseId: string) {
    setArtifacts(await getLearningArtifacts(courseId));
  }

  async function handleAnalyzeSources(regenerate: boolean) {
    if (route.kind !== "course") return;
    setLearningAction("analyzing");
    setLearningError(null);
    try {
      await classifyCourseSources(route.courseId, regenerate);
      await refreshLearningArtifacts(route.courseId);
    } catch (requestError) {
      setLearningError((requestError as Error).message);
    } finally {
      setLearningAction(null);
    }
  }

  async function handleBuildCourseMap(regenerate: boolean) {
    if (route.kind !== "course") return;
    setLearningAction("mapping");
    setLearningError(null);
    try {
      await generateCourseMap(route.courseId, regenerate);
      await refreshLearningArtifacts(route.courseId);
    } catch (requestError) {
      setLearningError((requestError as Error).message);
    } finally {
      setLearningAction(null);
    }
  }

  async function handleAcceptCourseMap() {
    if (route.kind !== "course" || !artifacts?.courseMap) return;
    setLearningAction("accepting");
    setLearningError(null);
    try {
      await acceptCourseMap(route.courseId, artifacts.courseMap.id);
      const [course] = await Promise.all([
        getCourse(route.courseId),
        refreshLearningArtifacts(route.courseId),
        loadLibrary(),
      ]);
      setSelectedCourse(course);
    } catch (requestError) {
      setLearningError((requestError as Error).message);
    } finally {
      setLearningAction(null);
    }
  }

  const activePage =
    route.kind === "hand-tracking" ? "hand-tracking" : route.kind === "course" ? "course" : route.kind === "info" ? "info" : "library";

  return (
    <div className="app-shell">
      <AppHeader
        service={service}
        activePage={activePage}
        onHome={() => navigate("/")}
        onHandTracking={() => navigate("/hand-tracking")}
        onInfo={() => navigate("/how-it-works")}
      />
      {route.kind === "course" ? (
        <CoursePage
          course={selectedCourse}
          loading={loading}
          error={error}
          artifacts={artifacts}
          codex={codex}
          learningAction={learningAction}
          learningError={learningError}
          onBack={() => navigate("/")}
          onUpload={handleUpload}
          onAnalyze={handleAnalyzeSources}
          onBuildMap={handleBuildCourseMap}
          onAcceptMap={handleAcceptCourseMap}
        />
      ) : route.kind === "hand-tracking" ? (
        <HandTrackingPage />
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
