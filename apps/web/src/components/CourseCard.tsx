import type { CourseSummary } from "@local-learning-studio/contracts";

interface CourseCardProps {
  course: CourseSummary;
  onOpen: () => void;
}

export function CourseCard({ course, onOpen }: CourseCardProps) {
  const initial = (course.code || course.title).trim().charAt(0).toUpperCase();

  return (
    <button
      type="button"
      className={`course-card course-card--${course.accent}`}
      onClick={onOpen}
    >
      <span className="course-card__topline">
        <span className="course-card__mark" aria-hidden="true">
          {initial}
        </span>
        <span className="course-card__arrow" aria-hidden="true">
          ↗
        </span>
      </span>
      <span className="course-card__body">
        <span className="course-card__code">
          {course.code || "Personal course"}
        </span>
        <strong>{course.title}</strong>
        <span className="course-card__term">
          {course.term || "No term assigned"}
        </span>
      </span>
      <span className="course-card__counts">
        <span>
          <strong>{course.materialCount}</strong> materials
        </span>
        <span>
          <strong>{course.moduleCount}</strong> modules
        </span>
      </span>
    </button>
  );
}

