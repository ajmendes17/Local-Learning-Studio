import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type {
  CodexStatusResponse,
  CourseDetail,
  CourseLearningArtifactsResponse,
  CourseSummary,
  CreateCourseRequest,
  HealthResponse,
  LearnerProfileResponse,
  MaterialKind,
} from "@local-learning-studio/contracts";
import { AppHeader, type ServiceState } from "./components/AppHeader";
import type { LearningAction } from "./components/CourseMapPanel";
import {
  ApiRequestError,
  acceptCourseMap,
  classifyCourseSources,
  createCourse,
  generateCourseMap,
  getCodexStatus,
  getCourse,
  getLearningArtifacts,
  listCourses,
  uploadMaterial,
  type ApiErrorInfo,
} from "./lib/api";

const CoursePage = lazy(() => import("./views/CoursePage").then(({ CoursePage }) => ({ default: CoursePage })));
const HomePage = lazy(() => import("./views/HomePage").then(({ HomePage }) => ({ default: HomePage })));
const InfoPage = lazy(() => import("./views/InfoPage").then(({ InfoPage }) => ({ default: InfoPage })));
const HandTrackingPage = lazy(() => import("./views/HandTrackingPage").then(({ HandTrackingPage }) => ({ default: HandTrackingPage })));
const StudyPage = lazy(() => import("./views/StudyPage").then(({ StudyPage }) => ({ default: StudyPage })));

type AppRoute =
  | { kind: "library" }
  | { kind: "course-study"; courseId: string; topic?: string; sourceMaterialId?: string; assessmentId?: string; sessionId?: string }
  | { kind: "hand-tracking" }
  | { kind: "info" }
  | { kind: "course"; courseId: string };

export interface LearningRunInfo {
  operationId: string;
  phase: "classification" | "course-map";
  startedAt: number;
  status: "running" | "complete" | "failed";
  model?: string;
  promptCharacters?: number;
  sourceStats?: { materialCount: number; passageCount: number; characterCount: number };
  omittedPassageCount?: number;
  durationMs?: number;
  usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningOutputTokens: number } | null;
}

function routeFromPath(): AppRoute {
  const studyMatch = window.location.pathname.match(/^\/courses\/([^/]+)\/study$/);
  if (studyMatch?.[1]) {
    const query = new URLSearchParams(window.location.search);
    return { kind: "course-study", courseId: studyMatch[1], topic: query.get("topic") ?? undefined, sourceMaterialId: query.get("sourceMaterialId") ?? undefined, assessmentId: query.get("assessmentId") ?? undefined, sessionId: query.get("sessionId") ?? undefined };
  }
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
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfileResponse | null>(null);
  const [codex, setCodex] = useState<CodexStatusResponse | null>(null);
  const [learningAction, setLearningAction] = useState<LearningAction>(null);
  const [learningRun, setLearningRun] = useState<LearningRunInfo | null>(null);
  const [, setClockTick] = useState(0);
  const [learningError, setLearningError] = useState<ApiErrorInfo | null>(null);
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
      const [course, learningArtifacts, codexStatus, profile] = await Promise.all([
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
        fetch(`/api/courses/${courseId}/learner/profile`).then(async (response) => response.ok ? await response.json() as LearnerProfileResponse : null).catch(() => null),
      ]);
      setSelectedCourse(course);
      setArtifacts(learningArtifacts);
      setCodex(codexStatus);
      setLearnerProfile(profile);
    } catch (requestError) {
      setError((requestError as Error).message);
      setSelectedCourse(null);
      setArtifacts(null);
      setLearnerProfile(null);
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
    if (route.kind !== "course") return;
    const events = new EventSource(`/api/courses/${route.courseId}/learning-operations`);
    events.onmessage = (message) => {
      const event = JSON.parse(message.data) as Record<string, unknown>;
      if (event.type === "started") {
        setLearningRun({ operationId: String(event.operationId), phase: event.phase as LearningRunInfo["phase"], startedAt: Date.parse(String(event.startedAt)), status: "running", model: String(event.model), promptCharacters: Number(event.promptCharacters), sourceStats: event.sourceStats as LearningRunInfo["sourceStats"], omittedPassageCount: Number(event.omittedPassageCount) });
      } else if (event.type === "cached") {
        setLearningRun({ operationId: `cached-${String(event.phase)}`, phase: event.phase as LearningRunInfo["phase"], startedAt: Date.now(), status: "complete", model: "Cached result", durationMs: 0, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 } });
      } else if (event.type === "completed") {
        setLearningRun((current) => current && current.operationId === event.operationId ? { ...current, status: "complete", model: String(event.model), durationMs: Number(event.durationMs), usage: event.usage as LearningRunInfo["usage"] } : current);
      } else if (event.type === "failed") {
        setLearningRun((current) => current && current.operationId === event.operationId ? { ...current, status: "failed" } : current);
      }
    };
    return () => events.close();
  }, [route]);

  useEffect(() => {
    if (!learningRun || learningRun.status !== "running") return;
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [learningRun]);

  useEffect(() => {
    if (route.kind === "course" || route.kind === "course-study") {
      void loadCourse(route.courseId);
    } else {
      setSelectedCourse(null);
      setArtifacts(null);
      setLearnerProfile(null);
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
      setLearningError(requestError instanceof ApiRequestError ? requestError.info : { error: (requestError as Error).message });
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
      setLearningError(requestError instanceof ApiRequestError ? requestError.info : { error: (requestError as Error).message });
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
      setLearningError(requestError instanceof ApiRequestError ? requestError.info : { error: (requestError as Error).message });
    } finally {
      setLearningAction(null);
    }
  }

  const activePage = route.kind === "course-study" ? "study" :
    route.kind === "hand-tracking" ? "hand-tracking" :
    route.kind === "course" ? "course" : route.kind === "info" ? "info" : "library";

  return (
    <div className="app-shell">
      <AppHeader
        service={service}
        activePage={activePage}
        onHome={() => navigate("/")}
        onHandTracking={() => navigate("/hand-tracking")}
        onInfo={() => navigate("/how-it-works")}
      />
      <Suspense fallback={<div className="page-chunk-loading" role="status">Loading your workspace…</div>}>
      {route.kind === "course-study" ? (
        <StudyPage courseId={route.courseId} courseTitle={selectedCourse?.title ?? "Class"} initialTopic={route.topic} initialSourceMaterialId={route.sourceMaterialId} initialAssessmentId={route.assessmentId} initialSessionId={route.sessionId} onBack={() => navigate(`/courses/${route.courseId}`)} />
      ) : route.kind === "course" ? (
      <CoursePage
          course={selectedCourse}
          loading={loading}
          error={error}
          artifacts={artifacts}
          learnerProgress={learnerProfile?.concepts ?? []}
          sourceProgress={learnerProfile?.sources ?? []}
          codex={codex}
          learningAction={learningAction}
          learningRun={learningRun}
          learningError={learningError}
          onBack={() => navigate("/")}
          onUpload={handleUpload}
          onAnalyze={handleAnalyzeSources}
          onBuildMap={handleBuildCourseMap}
          onAcceptMap={handleAcceptCourseMap}
          onStudy={() => navigate(`/courses/${route.courseId}/study`)}
          onStudyTopic={(topic, sourceMaterialId, assessmentId) => navigate(`/courses/${route.courseId}/study?topic=${encodeURIComponent(topic)}${sourceMaterialId ? `&sourceMaterialId=${encodeURIComponent(sourceMaterialId)}` : ""}${assessmentId ? `&assessmentId=${encodeURIComponent(assessmentId)}` : ""}`)}
          onStudyMaterial={(topic, materialId) => navigate(`/courses/${route.courseId}/study?topic=${encodeURIComponent(topic)}&sourceMaterialId=${encodeURIComponent(materialId)}`)}
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
      </Suspense>
    </div>
  );
}
