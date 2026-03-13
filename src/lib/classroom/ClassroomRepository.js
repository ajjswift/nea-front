export class ClassroomRepository {
    constructor(database) {
        this.database = database;
    }

    async getUserRole(userId, executor = this.database) {
        const result = await executor.query(
            `
                SELECT role
                FROM user_profiles
                WHERE user_id = $1
                LIMIT 1
            `,
            [userId],
        );

        if (!result.rows.length) {
            return "student";
        }

        return result.rows[0].role || "student";
    }

    async listUsersByUsernames(usernames, executor = this.database) {
        if (!usernames.length) {
            return [];
        }

        const result = await executor.query(
            `
                SELECT
                    u.id,
                    u.username,
                    COALESCE(up.role, 'student') AS role
                FROM users AS u
                LEFT JOIN user_profiles AS up
                    ON up.user_id = u.id
                WHERE u.username = ANY($1::text[])
            `,
            [usernames],
        );

        return result.rows;
    }

    async createClass(
        { id, teacherId, name, description = null, joinCode },
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                INSERT INTO classes (
                    id,
                    teacher_id,
                    name,
                    description,
                    join_code,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                RETURNING
                    id,
                    teacher_id,
                    name,
                    description,
                    join_code,
                    created_at,
                    updated_at
            `,
            [id, teacherId, name, description, joinCode],
        );

        return result.rows[0];
    }

    async listTeacherClasses(teacherId, executor = this.database) {
        const result = await executor.query(
            `
                SELECT
                    c.id,
                    c.teacher_id,
                    c.name,
                    c.description,
                    c.join_code,
                    c.created_at,
                    c.updated_at
                FROM classes AS c
                WHERE c.teacher_id = $1
                ORDER BY c.created_at DESC
            `,
            [teacherId],
        );

        return result.rows;
    }

    async listStudentClasses(studentId, executor = this.database) {
        const result = await executor.query(
            `
                SELECT
                    c.id,
                    c.teacher_id,
                    c.name,
                    c.description,
                    c.created_at,
                    c.updated_at
                FROM class_enrollments AS ce
                INNER JOIN classes AS c
                    ON c.id = ce.class_id
                WHERE ce.student_id = $1
                ORDER BY c.created_at DESC
            `,
            [studentId],
        );

        return result.rows;
    }

    async getClassByIdForTeacher(classId, teacherId, executor = this.database) {
        const result = await executor.query(
            `
                SELECT
                    c.id,
                    c.teacher_id,
                    c.name,
                    c.description,
                    c.join_code,
                    c.created_at,
                    c.updated_at
                FROM classes AS c
                WHERE c.id = $1
                    AND c.teacher_id = $2
                LIMIT 1
            `,
            [classId, teacherId],
        );

        return result.rows[0] || null;
    }

    async getClassByJoinCode(joinCode, executor = this.database) {
        const result = await executor.query(
            `
                SELECT
                    c.id,
                    c.teacher_id,
                    c.name,
                    c.description,
                    c.join_code,
                    c.created_at,
                    c.updated_at
                FROM classes AS c
                WHERE c.join_code = $1
                LIMIT 1
            `,
            [joinCode],
        );

        return result.rows[0] || null;
    }

    async addClassEnrollment({ classId, studentId }, executor = this.database) {
        await executor.query(
            `
                INSERT INTO class_enrollments (
                    class_id,
                    student_id,
                    created_at
                )
                VALUES ($1, $2, NOW())
                ON CONFLICT (class_id, student_id)
                DO NOTHING
            `,
            [classId, studentId],
        );
    }

    async findTemplateEnvironmentForTeacher(
        environmentId,
        teacherId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    id,
                    user_id,
                    name,
                    description,
                    runtime,
                    status
                FROM environments
                WHERE id = $1
                    AND user_id = $2
                LIMIT 1
            `,
            [environmentId, teacherId],
        );

        return result.rows[0] || null;
    }

    async replaceClassEnrollments(
        { classId, teacherId, studentIds },
        executor = this.database,
    ) {
        const ownedClass = await this.getClassByIdForTeacher(
            classId,
            teacherId,
            executor,
        );

        if (!ownedClass) {
            return false;
        }

        await executor.query("DELETE FROM class_enrollments WHERE class_id = $1", [
            classId,
        ]);

        if (studentIds.length > 0) {
            await executor.query(
                `
                    INSERT INTO class_enrollments (
                        class_id,
                        student_id,
                        created_at
                    )
                    SELECT $1, UNNEST($2::uuid[]), NOW()
                `,
                [classId, studentIds],
            );
        }

        return true;
    }

    async listClassStudents(classId, teacherId, executor = this.database) {
        const result = await executor.query(
            `
                SELECT
                    u.id,
                    u.username,
                    COALESCE(up.role, 'student') AS role,
                    ce.created_at AS enrolled_at
                FROM classes AS c
                INNER JOIN class_enrollments AS ce
                    ON ce.class_id = c.id
                INNER JOIN users AS u
                    ON u.id = ce.student_id
                LEFT JOIN user_profiles AS up
                    ON up.user_id = u.id
                WHERE c.id = $1
                    AND c.teacher_id = $2
                ORDER BY u.username ASC
            `,
            [classId, teacherId],
        );

        return result.rows;
    }

    async createAssignment(
        {
            id,
            classId,
            teacherId,
            title,
            description = null,
            dueAt = null,
            templateEnvironmentId = null,
            testCasesJson = [],
            checklistJson = {},
        },
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                INSERT INTO assignments (
                    id,
                    class_id,
                    teacher_id,
                    title,
                    description,
                    due_at,
                    template_environment_id,
                    test_cases_json,
                    checklist_json,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
                RETURNING
                    id,
                    class_id,
                    teacher_id,
                    title,
                    description,
                    due_at,
                    template_environment_id,
                    test_cases_json,
                    checklist_json,
                    created_at,
                    updated_at
            `,
            [
                id,
                classId,
                teacherId,
                title,
                description,
                dueAt,
                templateEnvironmentId,
                JSON.stringify(testCasesJson || []),
                JSON.stringify(checklistJson || {}),
            ],
        );

        return result.rows[0];
    }

    async linkAssignmentEnvironment(
        { id, assignmentId, studentId, environmentId },
        executor = this.database,
    ) {
        await executor.query(
            `
                INSERT INTO assignment_environments (
                    id,
                    assignment_id,
                    student_id,
                    environment_id,
                    created_at
                )
                VALUES ($1, $2, $3, $4, NOW())
            `,
            [id, assignmentId, studentId, environmentId],
        );
    }

    async updateAssignment(
        {
            assignmentId,
            teacherId,
            title,
            description,
            dueAt,
            testCasesJson = [],
            checklistJson = {},
        },
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                UPDATE assignments
                SET
                    title = $3,
                    description = $4,
                    due_at = $5,
                    test_cases_json = $6,
                    checklist_json = $7,
                    updated_at = NOW()
                WHERE id = $1
                    AND teacher_id = $2
                RETURNING
                    id,
                    class_id,
                    teacher_id,
                    title,
                    description,
                    due_at,
                    template_environment_id,
                    test_cases_json,
                    checklist_json,
                    created_at,
                    updated_at
            `,
            [
                assignmentId,
                teacherId,
                title,
                description,
                dueAt,
                JSON.stringify(testCasesJson || []),
                JSON.stringify(checklistJson || {}),
            ],
        );

        return result.rows[0] || null;
    }

    async findAssignmentByIdForTeacher(
        assignmentId,
        teacherId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    id,
                    class_id,
                    teacher_id,
                    title,
                    description,
                    due_at,
                    template_environment_id,
                    test_cases_json,
                    checklist_json,
                    created_at,
                    updated_at
                FROM assignments
                WHERE id = $1
                    AND teacher_id = $2
                LIMIT 1
            `,
            [assignmentId, teacherId],
        );

        return result.rows[0] || null;
    }

    async listAssignmentEnvironmentIdsForAssignment(
        assignmentId,
        teacherId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT ae.environment_id
                FROM assignment_environments AS ae
                INNER JOIN assignments AS a
                    ON a.id = ae.assignment_id
                WHERE ae.assignment_id = $1
                    AND a.teacher_id = $2
            `,
            [assignmentId, teacherId],
        );

        return result.rows.map((row) => row.environment_id);
    }

    async listAssignmentEnvironmentIdsForClass(
        classId,
        teacherId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT ae.environment_id
                FROM assignment_environments AS ae
                INNER JOIN assignments AS a
                    ON a.id = ae.assignment_id
                WHERE a.class_id = $1
                    AND a.teacher_id = $2
            `,
            [classId, teacherId],
        );

        return result.rows.map((row) => row.environment_id);
    }

    async deleteEnvironmentsByIds(
        environmentIds,
        executor = this.database,
    ) {
        if (!Array.isArray(environmentIds) || environmentIds.length === 0) {
            return 0;
        }

        const result = await executor.query(
            `
                DELETE FROM environments
                WHERE id::text = ANY($1::text[])
            `,
            [environmentIds],
        );

        return result.rowCount || 0;
    }

    async deleteAssignmentByIdForTeacher(
        assignmentId,
        teacherId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                DELETE FROM assignments
                WHERE id = $1
                    AND teacher_id = $2
                RETURNING
                    id,
                    class_id,
                    title
            `,
            [assignmentId, teacherId],
        );

        return result.rows[0] || null;
    }

    async deleteClassByIdForTeacher(
        classId,
        teacherId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                DELETE FROM classes
                WHERE id = $1
                    AND teacher_id = $2
                RETURNING
                    id,
                    name
            `,
            [classId, teacherId],
        );

        return result.rows[0] || null;
    }

    async listAssignmentsForClass(classId, teacherId, executor = this.database) {
        const result = await executor.query(
            `
                SELECT
                    a.id AS assignment_id,
                    a.class_id,
                    a.title,
                    a.description,
                    a.due_at,
                    a.template_environment_id,
                    a.test_cases_json,
                    a.checklist_json,
                    te.name AS template_environment_name,
                    a.created_at,
                    a.updated_at,
                    ae.id AS assignment_environment_id,
                    ae.environment_id,
                    ae.student_id,
                    ae.submission_status,
                    ae.submission_updated_at,
                    ae.submitted_at,
                    ae.reviewed_at,
                    ae.latest_test_run_json,
                    COALESCE(comment_counts.comments_count, 0) AS comments_count,
                    u.username AS student_username
                FROM assignments AS a
                LEFT JOIN environments AS te
                    ON te.id = a.template_environment_id
                LEFT JOIN assignment_environments AS ae
                    ON ae.assignment_id = a.id
                LEFT JOIN (
                    SELECT
                        assignment_environment_id,
                        COUNT(*)::int AS comments_count
                    FROM assignment_feedback_comments
                    GROUP BY assignment_environment_id
                ) AS comment_counts
                    ON comment_counts.assignment_environment_id = ae.id
                LEFT JOIN users AS u
                    ON u.id = ae.student_id
                WHERE a.class_id = $1
                    AND a.teacher_id = $2
                ORDER BY a.created_at DESC, student_username ASC NULLS LAST
            `,
            [classId, teacherId],
        );

        return result.rows;
    }

    async listAssignmentsForStudentClass(
        classId,
        studentId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    a.id AS assignment_id,
                    a.class_id,
                    a.title,
                    a.description,
                    a.due_at,
                    a.template_environment_id,
                    a.test_cases_json,
                    a.checklist_json,
                    te.name AS template_environment_name,
                    a.created_at,
                    a.updated_at,
                    ae.id AS assignment_environment_id,
                    ae.environment_id,
                    ae.student_id,
                    ae.submission_status,
                    ae.submission_updated_at,
                    ae.submitted_at,
                    ae.reviewed_at,
                    ae.latest_test_run_json,
                    COALESCE(comment_counts.comments_count, 0) AS comments_count,
                    u.username AS student_username
                FROM assignments AS a
                LEFT JOIN environments AS te
                    ON te.id = a.template_environment_id
                LEFT JOIN assignment_environments AS ae
                    ON ae.assignment_id = a.id
                    AND ae.student_id = $2
                LEFT JOIN (
                    SELECT
                        assignment_environment_id,
                        COUNT(*)::int AS comments_count
                    FROM assignment_feedback_comments
                    GROUP BY assignment_environment_id
                ) AS comment_counts
                    ON comment_counts.assignment_environment_id = ae.id
                LEFT JOIN users AS u
                    ON u.id = ae.student_id
                WHERE a.class_id = $1
                    AND ae.id IS NOT NULL
                ORDER BY a.created_at DESC
            `,
            [classId, studentId],
        );

        return result.rows;
    }

    async listOpenAssignmentsWithoutEnvironmentForStudent(
        classId,
        studentId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    a.id,
                    a.title,
                    a.description,
                    a.template_environment_id
                FROM assignments AS a
                LEFT JOIN assignment_environments AS ae
                    ON ae.assignment_id = a.id
                    AND ae.student_id = $2
                WHERE a.class_id = $1
                    AND ae.id IS NULL
                    AND (a.due_at IS NULL OR a.due_at >= NOW())
                ORDER BY a.created_at DESC
            `,
            [classId, studentId],
        );

        return result.rows;
    }

    async findStudentAssignmentEnvironment(
        studentId,
        environmentId,
        executor = this.database,
        options = {},
    ) {
        const lockClause = options?.forUpdate ? "FOR UPDATE" : "";
        const result = await executor.query(
            `
                SELECT
                    ae.id AS assignment_environment_id,
                    ae.assignment_id,
                    ae.environment_id,
                    ae.submission_status,
                    ae.submission_updated_at,
                    ae.submitted_at,
                    ae.reviewed_at,
                    ae.latest_test_run_json,
                    a.class_id,
                    a.title AS assignment_title,
                    c.name AS class_name
                FROM assignment_environments AS ae
                INNER JOIN assignments AS a
                    ON a.id = ae.assignment_id
                INNER JOIN classes AS c
                    ON c.id = a.class_id
                WHERE ae.student_id = $1
                    AND ae.environment_id = $2
                LIMIT 1
                ${lockClause}
            `,
            [studentId, environmentId],
        );

        return result.rows[0] || null;
    }

    async findAssignmentEnvironmentByEnvironmentId(
        environmentId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    ae.id,
                    ae.assignment_id,
                    ae.student_id,
                    ae.environment_id,
                    ae.submission_status,
                    ae.submission_updated_at,
                    ae.submitted_at,
                    ae.reviewed_at,
                    ae.latest_test_run_json,
                    a.class_id,
                    a.teacher_id,
                    a.title AS assignment_title,
                    c.name AS class_name,
                    u.username AS student_username
                FROM assignment_environments AS ae
                INNER JOIN assignments AS a
                    ON a.id = ae.assignment_id
                INNER JOIN classes AS c
                    ON c.id = a.class_id
                INNER JOIN users AS u
                    ON u.id = ae.student_id
                WHERE ae.environment_id = $1
                LIMIT 1
            `,
            [environmentId],
        );

        return result.rows[0] || null;
    }

    async findAssignmentEnvironmentForStudent(
        environmentId,
        studentId,
        executor = this.database,
        options = {},
    ) {
        const lockClause = options?.forUpdate ? "FOR UPDATE" : "";
        const result = await executor.query(
            `
                SELECT
                    ae.id,
                    ae.assignment_id,
                    ae.student_id,
                    ae.environment_id,
                    ae.submission_status,
                    ae.submission_updated_at,
                    ae.submitted_at,
                    ae.reviewed_at,
                    ae.latest_test_run_json,
                    a.class_id,
                    a.teacher_id,
                    a.title AS assignment_title
                FROM assignment_environments AS ae
                INNER JOIN assignments AS a
                    ON a.id = ae.assignment_id
                WHERE ae.environment_id = $1
                    AND ae.student_id = $2
                LIMIT 1
                ${lockClause}
            `,
            [environmentId, studentId],
        );

        return result.rows[0] || null;
    }

    async findAssignmentEnvironmentForTeacher(
        environmentId,
        teacherId,
        executor = this.database,
        options = {},
    ) {
        const lockClause = options?.forUpdate ? "FOR UPDATE" : "";
        const result = await executor.query(
            `
                SELECT
                    ae.id,
                    ae.assignment_id,
                    ae.student_id,
                    ae.environment_id,
                    ae.submission_status,
                    ae.submission_updated_at,
                    ae.submitted_at,
                    ae.reviewed_at,
                    ae.latest_test_run_json,
                    a.class_id,
                    a.teacher_id,
                    a.title AS assignment_title
                FROM assignment_environments AS ae
                INNER JOIN assignments AS a
                    ON a.id = ae.assignment_id
                WHERE ae.environment_id = $1
                    AND a.teacher_id = $2
                LIMIT 1
                ${lockClause}
            `,
            [environmentId, teacherId],
        );

        return result.rows[0] || null;
    }

    async updateAssignmentEnvironmentSubmissionStatus(
        environmentId,
        submissionStatus,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                UPDATE assignment_environments
                SET
                    submission_status = $2,
                    submission_updated_at = NOW(),
                    submitted_at = CASE
                        WHEN $2 = 'submitted' THEN NOW()
                        ELSE submitted_at
                    END,
                    reviewed_at = CASE
                        WHEN $2 = 'needs_changes' THEN NOW()
                        WHEN $2 IN ('submitted', 'in_progress', 'not_started') THEN NULL
                        ELSE reviewed_at
                    END
                WHERE environment_id = $1
                RETURNING
                    id,
                    assignment_id,
                    student_id,
                    environment_id,
                    submission_status,
                    submission_updated_at,
                    submitted_at,
                    reviewed_at,
                    latest_test_run_json
            `,
            [environmentId, submissionStatus],
        );

        return result.rows[0] || null;
    }

    async storeAssignmentEnvironmentTestRun(
        environmentId,
        latestTestRunJson,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                UPDATE assignment_environments
                SET
                    latest_test_run_json = $2,
                    submission_status = CASE
                        WHEN submission_status = 'not_started' THEN 'in_progress'
                        ELSE submission_status
                    END,
                    submission_updated_at = CASE
                        WHEN submission_status = 'not_started' THEN NOW()
                        ELSE submission_updated_at
                    END
                WHERE environment_id = $1
                RETURNING
                    id,
                    assignment_id,
                    student_id,
                    environment_id,
                    submission_status,
                    submission_updated_at,
                    submitted_at,
                    reviewed_at,
                    latest_test_run_json
            `,
            [environmentId, JSON.stringify(latestTestRunJson || {})],
        );

        return result.rows[0] || null;
    }

    async listAssignmentFeedbackCommentsForEnvironment(
        environmentId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    afc.id,
                    afc.assignment_environment_id,
                    afc.assignment_id,
                    afc.environment_id,
                    afc.teacher_id,
                    afc.file_name,
                    afc.line_number,
                    afc.content,
                    afc.created_at,
                    afc.updated_at,
                    u.username AS teacher_username
                FROM assignment_feedback_comments AS afc
                INNER JOIN users AS u
                    ON u.id = afc.teacher_id
                WHERE afc.environment_id = $1
                ORDER BY afc.created_at ASC
            `,
            [environmentId],
        );

        return result.rows;
    }

    async createAssignmentFeedbackComment(
        {
            id,
            assignmentEnvironmentId,
            assignmentId,
            environmentId,
            teacherId,
            fileName,
            lineNumber,
            content,
        },
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                INSERT INTO assignment_feedback_comments (
                    id,
                    assignment_environment_id,
                    assignment_id,
                    environment_id,
                    teacher_id,
                    file_name,
                    line_number,
                    content,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                RETURNING
                    id,
                    assignment_environment_id,
                    assignment_id,
                    environment_id,
                    teacher_id,
                    file_name,
                    line_number,
                    content,
                    created_at,
                    updated_at
            `,
            [
                id,
                assignmentEnvironmentId,
                assignmentId,
                environmentId,
                teacherId,
                fileName,
                lineNumber,
                content,
            ],
        );

        return result.rows[0] || null;
    }

    async findOpenHelpRequestForStudentEnvironment(
        studentId,
        environmentId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    id,
                    class_id,
                    assignment_id,
                    student_id,
                    environment_id,
                    message,
                    status,
                    created_at,
                    updated_at,
                    resolved_at
                FROM help_requests
                WHERE student_id = $1
                    AND environment_id = $2
                    AND status = 'open'
                LIMIT 1
            `,
            [studentId, environmentId],
        );

        return result.rows[0] || null;
    }

    async createHelpRequest(
        {
            id,
            classId,
            assignmentId = null,
            studentId,
            environmentId,
            message = null,
            status = "open",
        },
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                INSERT INTO help_requests (
                    id,
                    class_id,
                    assignment_id,
                    student_id,
                    environment_id,
                    message,
                    status,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING
                    id,
                    class_id,
                    assignment_id,
                    student_id,
                    environment_id,
                    message,
                    status,
                    created_at,
                    updated_at,
                    resolved_at
            `,
            [
                id,
                classId,
                assignmentId,
                studentId,
                environmentId,
                message,
                status,
            ],
        );

        return result.rows[0] || null;
    }

    async updateHelpRequestMessage(
        helpRequestId,
        message,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                UPDATE help_requests
                SET
                    message = $2,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING
                    id,
                    class_id,
                    assignment_id,
                    student_id,
                    environment_id,
                    message,
                    status,
                    created_at,
                    updated_at,
                    resolved_at
            `,
            [helpRequestId, message],
        );

        return result.rows[0] || null;
    }

    async listOpenHelpRequestsForTeacher(
        teacherId,
        classId = null,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    hr.id,
                    hr.class_id,
                    hr.assignment_id,
                    hr.student_id,
                    hr.environment_id,
                    hr.message,
                    hr.status,
                    hr.created_at,
                    hr.updated_at,
                    hr.resolved_at,
                    u.username AS student_username,
                    a.title AS assignment_title,
                    c.name AS class_name
                FROM help_requests AS hr
                INNER JOIN classes AS c
                    ON c.id = hr.class_id
                INNER JOIN users AS u
                    ON u.id = hr.student_id
                LEFT JOIN assignments AS a
                    ON a.id = hr.assignment_id
                WHERE c.teacher_id = $1
                    AND hr.status = 'open'
                    AND ($2::text IS NULL OR hr.class_id = $2)
                ORDER BY hr.created_at ASC
            `,
            [teacherId, classId],
        );

        return result.rows;
    }

    async resolveHelpRequestForTeacher(
        helpRequestId,
        teacherId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                UPDATE help_requests AS hr
                SET
                    status = 'resolved',
                    updated_at = NOW(),
                    resolved_at = NOW()
                FROM classes AS c
                WHERE hr.id = $1
                    AND hr.status = 'open'
                    AND c.id = hr.class_id
                    AND c.teacher_id = $2
                RETURNING
                    hr.id,
                    hr.class_id,
                    hr.assignment_id,
                    hr.student_id,
                    hr.environment_id,
                    hr.message,
                    hr.status,
                    hr.created_at,
                    hr.updated_at,
                    hr.resolved_at
            `,
            [helpRequestId, teacherId],
        );

        return result.rows[0] || null;
    }

    async canTeacherAccessEnvironment(
        environmentId,
        teacherId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT 1
                FROM assignment_environments AS ae
                INNER JOIN assignments AS a
                    ON a.id = ae.assignment_id
                INNER JOIN classes AS c
                    ON c.id = a.class_id
                WHERE ae.environment_id = $1
                    AND a.teacher_id = $2
                    AND c.teacher_id = $2
                LIMIT 1
            `,
            [environmentId, teacherId],
        );

        return result.rows.length > 0;
    }

    async findAssignmentEnvironmentContext(
        environmentId,
        executor = this.database,
    ) {
        const result = await executor.query(
            `
                SELECT
                    ae.id AS assignment_environment_id,
                    ae.assignment_id,
                    ae.student_id,
                    ae.environment_id,
                    ae.submission_status,
                    ae.submission_updated_at,
                    ae.submitted_at,
                    ae.reviewed_at,
                    ae.latest_test_run_json,
                    a.class_id,
                    a.teacher_id,
                    a.template_environment_id,
                    a.title AS assignment_title,
                    a.description AS assignment_description,
                    a.due_at,
                    a.test_cases_json,
                    a.checklist_json
                FROM assignment_environments AS ae
                INNER JOIN assignments AS a
                    ON a.id = ae.assignment_id
                WHERE ae.environment_id = $1
                LIMIT 1
            `,
            [environmentId],
        );

        return result.rows[0] || null;
    }
}
