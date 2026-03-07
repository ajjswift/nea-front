BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_user_id
    ON session (user_id);

CREATE TABLE IF NOT EXISTS environments (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(500),
    runtime VARCHAR(64) NOT NULL DEFAULT 'python-3.11',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_opened_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_environments_user_id
    ON environments (user_id);

CREATE INDEX IF NOT EXISTS idx_environments_updated_at
    ON environments (updated_at DESC);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('teacher', 'student')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(800),
    join_code VARCHAR(12) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_teacher_id
    ON classes (teacher_id);

CREATE TABLE IF NOT EXISTS class_enrollments (
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_student_id
    ON class_enrollments (student_id);

CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    description VARCHAR(2000),
    due_at TIMESTAMPTZ,
    template_environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS test_cases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS checklist_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_assignments_class_id
    ON assignments (class_id);

CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id
    ON assignments (teacher_id);

CREATE INDEX IF NOT EXISTS idx_assignments_template_environment_id
    ON assignments (template_environment_id);

CREATE TABLE IF NOT EXISTS help_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    environment_id TEXT NOT NULL,
    message VARCHAR(1000),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_help_requests_class_status_created
    ON help_requests (class_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_help_requests_student_status
    ON help_requests (student_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_help_requests_open_student_environment
    ON help_requests (student_id, environment_id)
    WHERE status = 'open';

CREATE TABLE IF NOT EXISTS assignment_environments (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    environment_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assignment_id, student_id),
    UNIQUE (environment_id)
);

ALTER TABLE assignment_environments
    ADD COLUMN IF NOT EXISTS submission_status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (submission_status IN ('not_started', 'in_progress', 'submitted', 'needs_changes')),
    ADD COLUMN IF NOT EXISTS submission_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS latest_test_run_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_assignment_environments_assignment_id
    ON assignment_environments (assignment_id);

CREATE INDEX IF NOT EXISTS idx_assignment_environments_student_id
    ON assignment_environments (student_id);

CREATE INDEX IF NOT EXISTS idx_assignment_environments_submission_status
    ON assignment_environments (submission_status);

CREATE TABLE IF NOT EXISTS assignment_feedback_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_environment_id TEXT NOT NULL REFERENCES assignment_environments(id) ON DELETE CASCADE,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    environment_id TEXT NOT NULL,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(160) NOT NULL,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    content VARCHAR(2000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_feedback_comments_environment_created
    ON assignment_feedback_comments (environment_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assignment_feedback_comments_assignment_environment
    ON assignment_feedback_comments (assignment_environment_id, created_at);

COMMIT;
