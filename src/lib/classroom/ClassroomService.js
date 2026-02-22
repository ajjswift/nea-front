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
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    environments: [],
                });
            }

            if (row.assignment_environment_id) {
                grouped.get(row.assignment_id).environments.push({
                    assignmentEnvironmentId: row.assignment_environment_id,
                    environmentId: row.environment_id,
                    studentId: row.student_id,
                    studentUsername: row.student_username,
                });
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

        const assignment = await this.classroomRepository.updateAssignment({
            assignmentId,
            teacherId: user.userId,
            title,
            description,
            dueAt,
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

    async canTeacherAccessEnvironment(user, environmentId) {
        this.ensureTeacher(user);

        return this.classroomRepository.canTeacherAccessEnvironment(
            environmentId,
            user.userId,
        );
    }
}
