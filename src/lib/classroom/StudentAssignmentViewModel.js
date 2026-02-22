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
    }) {
        this.assignmentId = assignmentId;
        this.title = title;
        this.description = description;
        this.dueAt = dueAt;
        this.classId = classId;
        this.className = className;
        this.environmentId = environmentId;
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
}
