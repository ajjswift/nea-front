import { randomBytes, randomUUID } from "crypto";

export class ClassroomValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ClassroomValidationError";
    }
}

export class ClassroomAuthorizationError extends Error {
    constructor(message = "Forbidden") {
        super(message);
        this.name = "ClassroomAuthorizationError";
    }
}

export class ClassroomNotFoundError extends Error {
    constructor(message = "Not found") {
        super(message);
        this.name = "ClassroomNotFoundError";
    }
}

export class ClassroomService {
    constructor({ classroomRepository, database }) {
        this.classroomRepository = classroomRepository;
        this.database = database;
        this.joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    }

    ensureTeacher(user) {
        if (!user || user.role !== "teacher") {
            throw new ClassroomAuthorizationError(
                "Teacher account required for classroom features.",
            );
        }
    }

    ensureStudent(user) {
        if (!user || user.role !== "student") {
            throw new ClassroomAuthorizationError(
                "Student account required to join a class with code.",
            );
        }
    }

    generateJoinCode(length = 8) {
        const bytes = randomBytes(length);
        let value = "";
        for (let index = 0; index < length; index += 1) {
            value += this.joinCodeAlphabet[
                bytes[index] % this.joinCodeAlphabet.length
            ];
        }

        return value;
    }

    normalizeName(name, label, maxLength) {
        const normalized = typeof name === "string" ? name.trim() : "";
        if (!normalized) {
            throw new ClassroomValidationError(`${label} is required.`);
        }

        if (normalized.length > maxLength) {
            throw new ClassroomValidationError(
                `${label} must be ${maxLength} characters or fewer.`,
            );
        }

        return normalized;
    }

    normalizeOptionalText(value, maxLength) {
        if (typeof value !== "string") {
            return null;
        }

        const normalized = value.trim();
        if (!normalized) {
            return null;
        }

        if (normalized.length > maxLength) {
            throw new ClassroomValidationError(
                `Text must be ${maxLength} characters or fewer.`,
            );
        }

        return normalized;
    }

    parseDueAt(dueAt) {
        if (!dueAt) {
            return null;
        }

        const date = new Date(dueAt);
        if (Number.isNaN(date.getTime())) {
            throw new ClassroomValidationError("Invalid due date.");
        }

        return date.toISOString();
    }

    normalizeJoinCode(value) {
        const normalized =
            typeof value === "string" ? value.trim().toUpperCase() : "";

        if (!normalized) {
            throw new ClassroomValidationError("Join code is required.");
        }

        if (normalized.length < 6 || normalized.length > 12) {
            throw new ClassroomValidationError(
                "Join code must be between 6 and 12 characters.",
            );
        }

        return normalized;
    }

    normalizeTemplateEnvironmentId(value) {
        if (typeof value !== "string") {
            return null;
        }

        const normalized = value.trim();
        if (!normalized) {
            return null;
        }

        return normalized;
    }

    normalizeStringArray(value, { maxItems = 50, maxLength = 120 } = {}) {
        if (!Array.isArray(value)) {
            return [];
        }

        const normalized = [];
        for (const entry of value) {
            const nextValue =
                typeof entry === "string" ? entry.trim() : "";
            if (!nextValue) {
                continue;
            }

            normalized.push(nextValue.slice(0, maxLength));
            if (normalized.length >= maxItems) {
                break;
            }
        }

        return [...new Set(normalized)];
    }

    normalizeChecklist(payload = {}) {
        const rawChecklist = payload?.checklist || {};
        const requiredFiles = this.normalizeStringArray(
            rawChecklist?.requiredFiles,
            { maxItems: 20, maxLength: 80 },
        );

        return {
            requiredFiles,
        };
    }

    normalizeTestCases(payload = {}) {
        const provided = payload?.testCases;
        if (!Array.isArray(provided)) {
            return [];
        }

        const normalized = [];
        for (let index = 0; index < provided.length; index += 1) {
            const entry = provided[index] || {};
            const name = this.normalizeOptionalText(
                entry?.name,
                120,
            ) || `Test ${index + 1}`;
            const input = this.normalizeOptionalText(entry?.input, 4000) || "";
            const expectedOutput = this.normalizeOptionalText(
                entry?.expectedOutput,
                8000,
            ) || "";

            normalized.push({
                id: randomUUID(),
                name,
                input,
                expectedOutput,
            });

            if (normalized.length >= 25) {
                break;
            }
        }

        return normalized;
    }

    parseJsonArray(value, fallback = []) {
        if (Array.isArray(value)) {
            return value;
        }

        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : fallback;
            } catch {
                return fallback;
            }
        }

        return fallback;
    }

    parseJsonObject(value, fallback = {}) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return value;
        }

        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    return parsed;
                }
                return fallback;
            } catch {
                return fallback;
            }
        }

        return fallback;
    }

    normalizeSubmissionStatus(value) {
        const normalized =
            typeof value === "string" ? value.trim().toLowerCase() : "";
        const allowed = new Set([
            "not_started",
            "in_progress",
            "submitted",
            "needs_changes",
        ]);

        if (!allowed.has(normalized)) {
            throw new ClassroomValidationError("Invalid submission status.");
        }

        return normalized;
    }

    normalizeFeedbackFileName(value) {
        const normalized =
            typeof value === "string" ? value.trim().slice(0, 160) : "";
        if (!normalized) {
            throw new ClassroomValidationError("File name is required.");
        }

        return normalized;
    }

    normalizeFeedbackLineNumber(value) {
        const numeric = Number(value);
        if (!Number.isInteger(numeric) || numeric < 1 || numeric > 50000) {
            throw new ClassroomValidationError(
                "Line number must be a whole number between 1 and 50000.",
            );
        }

        return numeric;
    }

    normalizeFeedbackContent(value) {
        const normalized =
            typeof value === "string" ? value.trim().slice(0, 2000) : "";
        if (!normalized) {
            throw new ClassroomValidationError("Comment text is required.");
        }

        return normalized;
    }

    parseLatestTestRun(value) {
        const parsed = this.parseJsonObject(value, {});
        const summary =
            parsed?.summary && typeof parsed.summary === "object"
                ? parsed.summary
                : {};
        const rawResults = Array.isArray(parsed?.results) ? parsed.results : [];

        return {
            ranAt:
                typeof parsed?.ranAt === "string" && parsed.ranAt
                    ? parsed.ranAt
                    : null,
            summary: {
                total: Number.isFinite(summary?.total) ? summary.total : 0,
                passed: Number.isFinite(summary?.passed) ? summary.passed : 0,
                failed: Number.isFinite(summary?.failed) ? summary.failed : 0,
            },
            results: rawResults.slice(0, 25).map((entry, index) => ({
                id:
                    typeof entry?.id === "string" && entry.id.trim()
                        ? entry.id.trim()
                        : `result-${index + 1}`,
                name:
                    typeof entry?.name === "string" && entry.name.trim()
                        ? entry.name.trim().slice(0, 120)
                        : `Test ${index + 1}`,
                input: typeof entry?.input === "string" ? entry.input : "",
                expectedOutput:
                    typeof entry?.expectedOutput === "string"
                        ? entry.expectedOutput
                        : "",
                actualOutput:
                    typeof entry?.actualOutput === "string"
                        ? entry.actualOutput
                        : "",
                exitCode: Number.isFinite(entry?.exitCode) ? entry.exitCode : null,
                runtimeError:
                    typeof entry?.runtimeError === "string"
                        ? entry.runtimeError
                        : null,
                timedOut: Boolean(entry?.timedOut),
                passed: Boolean(entry?.passed),
                line: Number.isFinite(entry?.line) ? entry.line : null,
            })),
        };
    }

    mapAssignmentEnvironment(row) {
        if (!row?.assignment_environment_id) {
            return null;
        }

        const latestTestRun = this.parseLatestTestRun(row.latest_test_run_json);

        return {
            assignmentEnvironmentId: row.assignment_environment_id,
            environmentId: row.environment_id,
            studentId: row.student_id,
            studentUsername: row.student_username,
            submissionStatus: row.submission_status || "not_started",
            submissionUpdatedAt: row.submission_updated_at || null,
            submittedAt: row.submitted_at || null,
            reviewedAt: row.reviewed_at || null,
            latestTestRun,
            latestTestSummary: latestTestRun.summary,
            commentsCount: Number.isFinite(row.comments_count)
                ? row.comments_count
                : 0,
        };
    }

    mapAssignmentFeedbackComment(row) {
        if (!row) {
            return null;
        }

        return {
            id: row.id,
            assignmentEnvironmentId: row.assignment_environment_id,
            assignmentId: row.assignment_id,
            environmentId: row.environment_id,
            teacherId: row.teacher_id,
            teacherUsername: row.teacher_username || "Teacher",
            fileName: row.file_name,
            lineNumber: Number.isFinite(row.line_number) ? row.line_number : null,
            content: row.content || "",
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    normalizeHelpMessage(value) {
        if (typeof value !== "string") {
            return null;
        }

        const normalized = value.trim();
        if (!normalized) {
            return null;
        }

        return normalized.slice(0, 1000);
    }

    getTemplateCloneEndpoint() {
        const wsUrl = process.env.WEBSOCKET_URL;
        if (!wsUrl) {
            return null;
        }

        try {
            const parsed = new URL(wsUrl);
            if (parsed.protocol === "ws:") {
                parsed.protocol = "http:";
            } else if (parsed.protocol === "wss:") {
                parsed.protocol = "https:";
            }

            parsed.pathname = "/internal/clone-template-files";
            parsed.search = "";
            return parsed.toString();
        } catch {
            return null;
        }
    }

    async cloneTemplateFiles(sourceEnvironmentId, targetEnvironmentId) {
        const endpoint = this.getTemplateCloneEndpoint();
        if (!endpoint) {
            throw new ClassroomValidationError(
                "Template cloning is unavailable because WEBSOCKET_URL is not configured.",
            );
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sourceEnvironmentId,
                targetEnvironmentId,
            }),
            cache: "no-store",
        });

        if (!response.ok) {
            throw new ClassroomValidationError(
                "Could not duplicate template files for student environments.",
            );
        }
    }

    normalizeStudentUsernames(payload = {}) {
        const provided = payload.usernames;
        if (!Array.isArray(provided)) {
            throw new ClassroomValidationError("usernames must be an array.");
        }

        const normalized = [
            ...new Set(
                provided
                    .map((value) =>
                        typeof value === "string" ? value.trim() : "",
                    )
                    .filter(Boolean),
            ),
        ];

        if (normalized.length > 200) {
            throw new ClassroomValidationError(
                "Cannot assign more than 200 students at once.",
            );
        }

        return normalized;
    }

    mapAssignments(rows) {
        const grouped = new Map();

        for (const row of rows) {
            const existing = grouped.get(row.assignment_id);
            if (!existing) {
                grouped.set(row.assignment_id, {
                    id: row.assignment_id,
                    classId: row.class_id,
                    title: row.title,
                    description: row.description,
                    dueAt: row.due_at,
                    templateEnvironmentId: row.template_environment_id,
                    templateEnvironmentName: row.template_environment_name,
                    testCases: this.parseJsonArray(row.test_cases_json, []),
                    checklist: this.parseJsonObject(row.checklist_json, {}),
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    environments: [],
                });
            }

            const mappedEnvironment = this.mapAssignmentEnvironment(row);
            if (mappedEnvironment) {
                grouped.get(row.assignment_id).environments.push(mappedEnvironment);
            }
        }

        return Array.from(grouped.values());
    }

    async createClassForTeacher(user, payload = {}) {
        this.ensureTeacher(user);

        const name = this.normalizeName(payload.name, "Class name", 120);
        const description = this.normalizeOptionalText(payload.description, 800);

        let createdClass = null;
        let attempt = 0;

        while (!createdClass && attempt < 10) {
            attempt += 1;
            try {
                createdClass = await this.classroomRepository.createClass({
                    id: randomUUID(),
                    teacherId: user.userId,
                    name,
                    description,
                    joinCode: this.generateJoinCode(8),
                });
            } catch (error) {
                const isJoinCodeCollision =
                    error?.code === "23505" &&
                    String(error?.constraint || "").includes("join_code");

                if (!isJoinCodeCollision) {
                    throw error;
                }
            }
        }

        if (!createdClass) {
            throw new ClassroomValidationError(
                "Could not generate a unique class join code. Please retry.",
            );
        }

        return {
            id: createdClass.id,
            teacherId: createdClass.teacher_id,
            name: createdClass.name,
            description: createdClass.description,
            joinCode: createdClass.join_code,
            createdAt: createdClass.created_at,
            updatedAt: createdClass.updated_at,
            students: [],
            assignments: [],
        };
    }

    async assignStudentsToClass(user, classId, payload = {}) {
        this.ensureTeacher(user);
        const usernames = this.normalizeStudentUsernames(payload);

        const users = await this.classroomRepository.listUsersByUsernames(usernames);
        const userByUsername = new Map(users.map((value) => [value.username, value]));

        const missing = usernames.filter((username) => !userByUsername.has(username));
        if (missing.length > 0) {
            throw new ClassroomValidationError(
                `These usernames were not found: ${missing.join(", ")}`,
            );
        }

        const nonStudent = users.filter((value) => value.role !== "student");
        if (nonStudent.length > 0) {
            throw new ClassroomValidationError(
                `Only student accounts can be added: ${nonStudent
                    .map((value) => value.username)
                    .join(", ")}`,
            );
        }

        const studentIds = users.map((value) => value.id);
        const updated = await this.classroomRepository.replaceClassEnrollments({
            classId,
            teacherId: user.userId,
            studentIds,
        });

        if (!updated) {
            throw new ClassroomNotFoundError("Class not found.");
        }

        const students = await this.classroomRepository.listClassStudents(
            classId,
            user.userId,
        );

        return students.map((student) => ({
            id: student.id,
            username: student.username,
            role: student.role,
            enrolledAt: student.enrolled_at,
        }));
    }

    async joinClassByCode(user, payload = {}) {
        this.ensureStudent(user);

        const joinCode = this.normalizeJoinCode(payload.joinCode);
        const classRow = await this.classroomRepository.getClassByJoinCode(joinCode);

        if (!classRow) {
            throw new ClassroomNotFoundError("Invalid class join code.");
        }

        await this.classroomRepository.addClassEnrollment({
            classId: classRow.id,
            studentId: user.userId,
        });

        return {
            id: classRow.id,
            name: classRow.name,
            joinCode: classRow.join_code,
        };
    }

    async createAssignmentForClass(user, classId, payload = {}) {
        this.ensureTeacher(user);

        const title = this.normalizeName(payload.title, "Assignment title", 160);
        const description = this.normalizeOptionalText(payload.description, 2000);
        const dueAt = this.parseDueAt(payload.dueAt);
        const testCases = this.normalizeTestCases(payload);
        const checklist = this.normalizeChecklist(payload);
        const templateEnvironmentId = this.normalizeTemplateEnvironmentId(
            payload.templateEnvironmentId,
        );

        const client = await this.database.getClient();
        try {
            await client.query("BEGIN");

            const ownedClass = await this.classroomRepository.getClassByIdForTeacher(
                classId,
                user.userId,
                client,
            );
            if (!ownedClass) {
                throw new ClassroomNotFoundError("Class not found.");
            }

            const students = await this.classroomRepository.listClassStudents(
                classId,
                user.userId,
                client,
            );

            if (students.length === 0) {
                throw new ClassroomValidationError(
                    "Add students to the class before creating an assignment.",
                );
            }

            let templateEnvironment = null;
            if (templateEnvironmentId) {
                templateEnvironment =
                    await this.classroomRepository.findTemplateEnvironmentForTeacher(
                        templateEnvironmentId,
                        user.userId,
                        client,
                    );

                if (!templateEnvironment) {
                    throw new ClassroomValidationError(
                        "Template environment not found for this teacher account.",
                    );
                }
            }

            const assignment = await this.classroomRepository.createAssignment(
                {
                    id: randomUUID(),
                    classId,
                    teacherId: user.userId,
                    title,
                    description,
                    dueAt,
                    templateEnvironmentId:
                        templateEnvironment?.id || null,
                    testCasesJson: testCases,
                    checklistJson: checklist,
                },
                client,
            );

            for (const student of students) {
                const environmentId = randomUUID();
                const environmentName = `${title} - ${student.username}`.slice(
                    0,
                    80,
                );
                const environmentDescription = (
                    description || templateEnvironment?.description
                )
                    ? (description || templateEnvironment?.description).slice(0, 500)
                    : null;
                const runtime = templateEnvironment?.runtime || "python-3.11";

                await client.query(
                    `
                        INSERT INTO environments (
                            id,
                            user_id,
                            name,
                            description,
                            runtime,
                            status,
                            created_at,
                            updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
                    `,
                    [
                        environmentId,
                        student.id,
                        environmentName,
                        environmentDescription,
                        runtime,
                    ],
                );

                if (templateEnvironment?.id) {
                    await this.cloneTemplateFiles(
                        templateEnvironment.id,
                        environmentId,
                    );
                }

                await this.classroomRepository.linkAssignmentEnvironment(
                    {
                        id: randomUUID(),
                        assignmentId: assignment.id,
                        studentId: student.id,
                        environmentId,
                    },
                    client,
                );
            }

            await client.query("COMMIT");
            return assignment;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateAssignment(user, assignmentId, payload = {}) {
        this.ensureTeacher(user);

        const title = this.normalizeName(payload.title, "Assignment title", 160);
        const description = this.normalizeOptionalText(payload.description, 2000);
        const dueAt = this.parseDueAt(payload.dueAt);
        const testCases = this.normalizeTestCases(payload);
        const checklist = this.normalizeChecklist(payload);

        const assignment = await this.classroomRepository.updateAssignment({
            assignmentId,
            teacherId: user.userId,
            title,
            description,
            dueAt,
            testCasesJson: testCases,
            checklistJson: checklist,
        });

        if (!assignment) {
            throw new ClassroomNotFoundError("Assignment not found.");
        }

        return assignment;
    }

    async deleteAssignment(user, assignmentId) {
        this.ensureTeacher(user);

        const client = await this.database.getClient();
        try {
            await client.query("BEGIN");

            const assignment = await this.classroomRepository.findAssignmentByIdForTeacher(
                assignmentId,
                user.userId,
                client,
            );
            if (!assignment) {
                throw new ClassroomNotFoundError("Assignment not found.");
            }

            const environmentIds =
                await this.classroomRepository.listAssignmentEnvironmentIdsForAssignment(
                    assignmentId,
                    user.userId,
                    client,
                );

            const deletedEnvironmentCount =
                await this.classroomRepository.deleteEnvironmentsByIds(
                    environmentIds,
                    client,
                );

            const deletedAssignment =
                await this.classroomRepository.deleteAssignmentByIdForTeacher(
                    assignmentId,
                    user.userId,
                    client,
                );

            if (!deletedAssignment) {
                throw new ClassroomNotFoundError("Assignment not found.");
            }

            await client.query("COMMIT");
            return {
                id: deletedAssignment.id,
                classId: deletedAssignment.class_id,
                title: deletedAssignment.title,
                deletedEnvironmentCount,
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteClass(user, classId) {
        this.ensureTeacher(user);

        const client = await this.database.getClient();
        try {
            await client.query("BEGIN");

            const classRow = await this.classroomRepository.getClassByIdForTeacher(
                classId,
                user.userId,
                client,
            );
            if (!classRow) {
                throw new ClassroomNotFoundError("Class not found.");
            }

            const environmentIds =
                await this.classroomRepository.listAssignmentEnvironmentIdsForClass(
                    classId,
                    user.userId,
                    client,
                );

            const deletedEnvironmentCount =
                await this.classroomRepository.deleteEnvironmentsByIds(
                    environmentIds,
                    client,
                );

            const deletedClass = await this.classroomRepository.deleteClassByIdForTeacher(
                classId,
                user.userId,
                client,
            );

            if (!deletedClass) {
                throw new ClassroomNotFoundError("Class not found.");
            }

            await client.query("COMMIT");
            return {
                id: deletedClass.id,
                name: deletedClass.name,
                deletedEnvironmentCount,
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getTeacherDashboard(user) {
        this.ensureTeacher(user);

        const classes = await this.classroomRepository.listTeacherClasses(user.userId);

        const hydratedClasses = [];
        for (const classRow of classes) {
            const students = await this.classroomRepository.listClassStudents(
                classRow.id,
                user.userId,
            );
            const assignmentRows = await this.classroomRepository.listAssignmentsForClass(
                classRow.id,
                user.userId,
            );

            hydratedClasses.push({
                id: classRow.id,
                teacherId: classRow.teacher_id,
                name: classRow.name,
                description: classRow.description,
                joinCode: classRow.join_code,
                createdAt: classRow.created_at,
                updatedAt: classRow.updated_at,
                students: students.map((student) => ({
                    id: student.id,
                    username: student.username,
                    role: student.role,
                    enrolledAt: student.enrolled_at,
                })),
                assignments: this.mapAssignments(assignmentRows),
            });
        }

        return hydratedClasses;
    }

    async getStudentDashboard(user) {
        this.ensureStudent(user);

        const classes = await this.classroomRepository.listStudentClasses(user.userId);
        const hydratedClasses = [];

        for (const classRow of classes) {
            const assignmentRows =
                await this.classroomRepository.listAssignmentsForStudentClass(
                    classRow.id,
                    user.userId,
                );

            hydratedClasses.push({
                id: classRow.id,
                teacherId: classRow.teacher_id,
                name: classRow.name,
                description: classRow.description,
                createdAt: classRow.created_at,
                updatedAt: classRow.updated_at,
                assignments: this.mapAssignments(assignmentRows),
            });
        }

        return hydratedClasses;
    }

    mapHelpRequest(row) {
        if (!row) {
            return null;
        }

        return {
            id: row.id,
            classId: row.class_id,
            className: row.class_name || "Class",
            assignmentId: row.assignment_id || null,
            assignmentTitle: row.assignment_title || null,
            studentId: row.student_id,
            studentUsername: row.student_username || "Student",
            environmentId: row.environment_id,
            message: row.message || null,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            resolvedAt: row.resolved_at,
        };
    }

    async listTeacherHelpQueue(user, classId = null) {
        this.ensureTeacher(user);

        const normalizedClassId =
            typeof classId === "string" && classId.trim() ? classId.trim() : null;
        const rows = await this.classroomRepository.listOpenHelpRequestsForTeacher(
            user.userId,
            normalizedClassId,
        );

        return rows.map((row) => this.mapHelpRequest(row)).filter(Boolean);
    }

    async requestStudentHelp(user, payload = {}) {
        this.ensureStudent(user);

        const environmentId =
            typeof payload?.environmentId === "string"
                ? payload.environmentId.trim()
                : "";
        if (!environmentId) {
            throw new ClassroomValidationError("Environment ID is required.");
        }

        const environmentContext =
            await this.classroomRepository.findStudentAssignmentEnvironment(
                user.userId,
                environmentId,
            );
        if (!environmentContext) {
            throw new ClassroomAuthorizationError(
                "Help requests are only available in your assignment environments.",
            );
        }

        const message = this.normalizeHelpMessage(payload?.message);

        const existingOpenRequest =
            await this.classroomRepository.findOpenHelpRequestForStudentEnvironment(
                user.userId,
                environmentId,
            );

        if (existingOpenRequest) {
            const updated = await this.classroomRepository.updateHelpRequestMessage(
                existingOpenRequest.id,
                message,
            );
            const enriched = {
                ...updated,
                class_name: environmentContext.class_name,
                assignment_title: environmentContext.assignment_title,
                student_username: user.username,
            };
            return {
                request: this.mapHelpRequest(enriched),
                alreadyOpen: true,
            };
        }

        const created = await this.classroomRepository.createHelpRequest({
            id: randomUUID(),
            classId: environmentContext.class_id,
            assignmentId: environmentContext.assignment_id,
            studentId: user.userId,
            environmentId,
            message,
            status: "open",
        });

        const enriched = {
            ...created,
            class_name: environmentContext.class_name,
            assignment_title: environmentContext.assignment_title,
            student_username: user.username,
        };

        return {
            request: this.mapHelpRequest(enriched),
            alreadyOpen: false,
        };
    }

    async resolveHelpRequest(user, helpRequestId) {
        this.ensureTeacher(user);

        const normalizedId =
            typeof helpRequestId === "string" ? helpRequestId.trim() : "";
        if (!normalizedId) {
            throw new ClassroomValidationError("Help request ID is required.");
        }

        const resolved = await this.classroomRepository.resolveHelpRequestForTeacher(
            normalizedId,
            user.userId,
        );
        if (!resolved) {
            throw new ClassroomNotFoundError("Help request not found.");
        }

        return this.mapHelpRequest(resolved);
    }

    async canTeacherAccessEnvironment(user, environmentId) {
        this.ensureTeacher(user);

        return this.classroomRepository.canTeacherAccessEnvironment(
            environmentId,
            user.userId,
        );
    }

    async updateAssignmentSubmissionStatus(user, environmentId, payload = {}) {
        const normalizedEnvironmentId =
            typeof environmentId === "string" ? environmentId.trim() : "";
        if (!normalizedEnvironmentId) {
            throw new ClassroomValidationError("Environment ID is required.");
        }

        const nextStatus = this.normalizeSubmissionStatus(payload?.status);

        if (user?.role === "student") {
            const assignmentEnvironment =
                await this.classroomRepository.findAssignmentEnvironmentForStudent(
                    normalizedEnvironmentId,
                    user.userId,
                );
            if (!assignmentEnvironment) {
                throw new ClassroomAuthorizationError(
                    "You can only update submission state for your assignment environments.",
                );
            }

            if (!["in_progress", "submitted"].includes(nextStatus)) {
                throw new ClassroomAuthorizationError(
                    "Students can only mark work as in progress or submitted.",
                );
            }
        } else if (user?.role === "teacher") {
            const assignmentEnvironment =
                await this.classroomRepository.findAssignmentEnvironmentForTeacher(
                    normalizedEnvironmentId,
                    user.userId,
                );
            if (!assignmentEnvironment) {
                throw new ClassroomAuthorizationError(
                    "Teacher access required for this assignment environment.",
                );
            }

            if (!["in_progress", "needs_changes", "submitted"].includes(nextStatus)) {
                throw new ClassroomAuthorizationError(
                    "Teachers can mark work in progress, submitted, or needs changes.",
                );
            }
        } else {
            throw new ClassroomAuthorizationError("Authentication required.");
        }

        const updated =
            await this.classroomRepository.updateAssignmentEnvironmentSubmissionStatus(
                normalizedEnvironmentId,
                nextStatus,
            );

        if (!updated) {
            throw new ClassroomNotFoundError("Assignment environment not found.");
        }

        const context =
            await this.classroomRepository.findAssignmentEnvironmentByEnvironmentId(
                normalizedEnvironmentId,
            );

        return {
            assignmentEnvironmentId: updated.id,
            environmentId: updated.environment_id,
            assignmentId: updated.assignment_id,
            studentId: updated.student_id,
            classId: context?.class_id || null,
            submissionStatus: updated.submission_status || "not_started",
            submissionUpdatedAt: updated.submission_updated_at || null,
            submittedAt: updated.submitted_at || null,
            reviewedAt: updated.reviewed_at || null,
            latestTestRun: this.parseLatestTestRun(updated.latest_test_run_json),
        };
    }

    async createTeacherFeedbackComment(user, environmentId, payload = {}) {
        this.ensureTeacher(user);

        const normalizedEnvironmentId =
            typeof environmentId === "string" ? environmentId.trim() : "";
        if (!normalizedEnvironmentId) {
            throw new ClassroomValidationError("Environment ID is required.");
        }

        const assignmentEnvironment =
            await this.classroomRepository.findAssignmentEnvironmentForTeacher(
                normalizedEnvironmentId,
                user.userId,
            );
        if (!assignmentEnvironment) {
            throw new ClassroomAuthorizationError(
                "Teacher access required for this assignment environment.",
            );
        }

        const created =
            await this.classroomRepository.createAssignmentFeedbackComment({
                id: randomUUID(),
                assignmentEnvironmentId: assignmentEnvironment.id,
                assignmentId: assignmentEnvironment.assignment_id,
                environmentId: normalizedEnvironmentId,
                teacherId: user.userId,
                fileName: this.normalizeFeedbackFileName(payload?.fileName),
                lineNumber: this.normalizeFeedbackLineNumber(payload?.lineNumber),
                content: this.normalizeFeedbackContent(payload?.content),
            });

        if (!created) {
            throw new ClassroomValidationError("Could not create comment.");
        }

        const comments =
            await this.classroomRepository.listAssignmentFeedbackCommentsForEnvironment(
                normalizedEnvironmentId,
            );

        return comments
            .map((row) => this.mapAssignmentFeedbackComment(row))
            .filter(Boolean);
    }
}
