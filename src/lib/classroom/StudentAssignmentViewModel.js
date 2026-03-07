const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

export class StudentAssignmentViewModel {
    constructor({
        assignmentId,
        title,
        description = null,
        dueAt = null,
        classId,
        className,
        environmentId = null,
        submissionStatus = "not_started",
        latestTestSummary = null,
        commentsCount = 0,
    }) {
        this.assignmentId = assignmentId;
        this.title = title;
        this.description = description;
        this.dueAt = dueAt;
        this.classId = classId;
        this.className = className;
        this.environmentId = environmentId;
        this.submissionStatus = submissionStatus;
        this.latestTestSummary = latestTestSummary;
        this.commentsCount = commentsCount;
    }

    static fromDashboardClasses(classes = []) {
        const value = [];

        for (const classEntry of classes) {
            const assignments = Array.isArray(classEntry?.assignments)
                ? classEntry.assignments
                : [];

            for (const assignment of assignments) {
                const links = Array.isArray(assignment?.environments)
                    ? assignment.environments
                    : [];
                const primaryEnvironmentId = links[0]?.environmentId || null;

                value.push(
                    new StudentAssignmentViewModel({
                        assignmentId: assignment.id,
                        title: assignment.title || "Untitled assignment",
                        description: assignment.description || null,
                        dueAt: assignment.dueAt || null,
                        classId: classEntry.id,
                        className: classEntry.name || "Class",
                        environmentId: primaryEnvironmentId,
                        submissionStatus:
                            links[0]?.submissionStatus || "not_started",
                        latestTestSummary: links[0]?.latestTestSummary || null,
                        commentsCount: Number.isFinite(links[0]?.commentsCount)
                            ? links[0].commentsCount
                            : 0,
                    }),
                );
            }
        }

        return value.sort((left, right) => {
            const leftTime = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
            const rightTime = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;

            if (leftTime !== rightTime) {
                return leftTime - rightTime;
            }

            return left.title.localeCompare(right.title, undefined, {
                sensitivity: "base",
            });
        });
    }

    get hasEnvironment() {
        return Boolean(this.environmentId);
    }

    get classHref() {
        return `/classroom?classId=${encodeURIComponent(this.classId)}`;
    }

    get environmentHref() {
        if (!this.hasEnvironment) {
            return null;
        }

        return `/environment/${this.environmentId}?returnTo=${encodeURIComponent(
            this.classHref,
        )}`;
    }

    get dueAtLabel() {
        if (!this.dueAt) {
            return "No due date";
        }

        const parsed = new Date(this.dueAt);
        if (Number.isNaN(parsed.getTime())) {
            return "No due date";
        }

        return dateFormatter.format(parsed);
    }

    get dueUrgency() {
        if (!this.dueAt) {
            return null;
        }

        const dueDate = new Date(this.dueAt);
        if (Number.isNaN(dueDate.getTime())) {
            return null;
        }

        const now = new Date();
        const startToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        );
        const startTomorrow = new Date(startToday);
        startTomorrow.setDate(startTomorrow.getDate() + 1);
        const startDayAfterTomorrow = new Date(startTomorrow);
        startDayAfterTomorrow.setDate(startDayAfterTomorrow.getDate() + 1);
        const startInFourDays = new Date(startToday);
        startInFourDays.setDate(startInFourDays.getDate() + 4);

        if (dueDate.getTime() < now.getTime()) {
            return { label: "Overdue", tone: "overdue" };
        }
        if (dueDate.getTime() < startTomorrow.getTime()) {
            return { label: "Due today", tone: "today" };
        }
        if (dueDate.getTime() < startDayAfterTomorrow.getTime()) {
            return { label: "Due tomorrow", tone: "tomorrow" };
        }
        if (dueDate.getTime() < startInFourDays.getTime()) {
            return { label: "Due soon", tone: "soon" };
        }

        return { label: "Upcoming", tone: "upcoming" };
    }

    get testProgressLabel() {
        if (!this.latestTestSummary) {
            return null;
        }

        const total = Number.isFinite(this.latestTestSummary.total)
            ? this.latestTestSummary.total
            : 0;
        const passed = Number.isFinite(this.latestTestSummary.passed)
            ? this.latestTestSummary.passed
            : 0;

        if (total <= 0) {
            return null;
        }

        return `${passed}/${total} tests passed`;
    }
}
