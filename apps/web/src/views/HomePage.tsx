import { useMemo, useState } from "react";
import type {
  CourseSummary,
  CreateCourseRequest,
} from "@local-learning-studio/contracts";
import { CourseCard } from "../components/CourseCard";
import { CreateCourseDialog } from "../components/CreateCourseDialog";

interface HomePageProps {
  courses: CourseSummary[];
  loading: boolean;
  error: string | null;
  onCreate: (input: CreateCourseRequest) => Promise<void>;
  onOpen: (courseId: string) => void;
  onCanvasImport: () => void;
}

export function HomePage({
  courses,
  loading,
  error,
  onCreate,
  onOpen,
  onCanvasImport,
}: HomePageProps) {
  const [creating, setCreating] = useState(false);
  const materialCount = useMemo(
    () => courses.reduce((total, course) => total + course.materialCount, 0),
    [courses],
  );

  return (
    <main>
      <section className="library-hero">
        <div>
          <p className="eyebrow">Course library</p>
          <h1>What are you learning?</h1>
          <p>
            Keep each class, syllabus, module, and major exam in one focused
            workspace.
          </p>
        </div>
        <div className="library-actions"><button type="button" className="button-secondary button-primary--large" onClick={onCanvasImport}>Import from Canvas</button><button
          type="button"
          className="button-primary button-primary--large"
          onClick={() => setCreating(true)}
        >
          <span aria-hidden="true">+</span>
          New class
        </button></div>
      </section>

      <section className="library-content" aria-labelledby="classes-heading">
        <div className="library-heading">
          <div>
            <p className="section-kicker">Your spaces</p>
            <h2 id="classes-heading">Classes</h2>
          </div>
          <p>
            {courses.length} {courses.length === 1 ? "class" : "classes"} ·{" "}
            {materialCount} {materialCount === 1 ? "material" : "materials"}
          </p>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        {loading && courses.length === 0 ? (
          <div className="course-grid" aria-label="Loading courses">
            {[0, 1, 2].map((item) => (
              <div className="course-card course-card--skeleton" key={item} />
            ))}
          </div>
        ) : courses.length > 0 ? (
          <div className="course-grid">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onOpen={() => onOpen(course.id)}
              />
            ))}
            <button
              type="button"
              className="add-course-card"
              onClick={() => setCreating(true)}
            >
              <span aria-hidden="true">+</span>
              Add another class
            </button>
          </div>
        ) : (
          <div className="empty-library">
            <span className="empty-library__mark" aria-hidden="true">
              01
            </span>
            <div>
              <h2>Start with one class.</h2>
              <p>
                Create a course space, then add its syllabus and learning
                materials. Nothing leaves this local workspace by default.
              </p>
              <button
                type="button"
                className="button-primary"
                onClick={() => setCreating(true)}
              >
                Create your first class
              </button>
            </div>
          </div>
        )}
      </section>

      {creating ? (
        <CreateCourseDialog
          onClose={() => setCreating(false)}
          onCreate={onCreate}
        />
      ) : null}
    </main>
  );
}

