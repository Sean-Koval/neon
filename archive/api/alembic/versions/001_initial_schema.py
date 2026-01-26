"""Initial schema with all tables.

Revision ID: 001
Revises:
Create Date: 2026-01-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create all tables."""
    # Projects table
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), unique=True, nullable=False),
        sa.Column("mlflow_tracking_uri", sa.Text(), nullable=True),
        sa.Column("mlflow_experiment_id", sa.String(255), nullable=True),
        sa.Column(
            "settings",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # API Keys table
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key_prefix", sa.String(8), nullable=False),
        sa.Column("key_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scopes",
            postgresql.ARRAY(sa.Text()),
            server_default="{read}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
    )
    op.create_index("idx_api_keys_prefix", "api_keys", ["key_prefix"])
    op.create_index("idx_api_keys_project", "api_keys", ["project_id"])

    # Eval Suites table
    op.create_table(
        "eval_suites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("agent_id", sa.String(255), nullable=False),
        sa.Column(
            "config",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "name", name="uq_suite_project_name"),
    )

    # Eval Cases table
    op.create_table(
        "eval_cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "suite_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("eval_suites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("input", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("expected_tools", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("expected_tool_sequence", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("expected_output_contains", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("expected_output_pattern", sa.String(1000), nullable=True),
        sa.Column(
            "scorers",
            postgresql.ARRAY(sa.Text()),
            server_default="{tool_selection,reasoning}",
            nullable=False,
        ),
        sa.Column("scorer_config", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("min_score", sa.Float(), server_default="0.7", nullable=False),
        sa.Column("timeout_seconds", sa.Integer(), server_default="300", nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("suite_id", "name", name="uq_case_suite_name"),
    )

    # Eval Runs table
    op.create_table(
        "eval_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "suite_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("eval_suites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_version", sa.String(255), nullable=True),
        sa.Column("trigger", sa.String(50), nullable=False),
        sa.Column("trigger_ref", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), server_default="pending", nullable=False),
        sa.Column("config", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("summary", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("idx_eval_runs_suite", "eval_runs", ["suite_id"])
    op.create_index("idx_eval_runs_project_status", "eval_runs", ["project_id", "status"])
    op.create_index("idx_eval_runs_agent_version", "eval_runs", ["agent_version"])

    # Eval Results table
    op.create_table(
        "eval_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("eval_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("eval_cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("mlflow_run_id", sa.String(255), nullable=True),
        sa.Column("mlflow_trace_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("output", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("scores", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("score_details", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("execution_time_ms", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("idx_eval_results_run", "eval_results", ["run_id"])
    op.create_index("idx_eval_results_case", "eval_results", ["case_id"])


def downgrade() -> None:
    """Drop all tables in reverse order."""
    # Drop tables in reverse order of creation (respecting foreign keys)
    op.drop_index("idx_eval_results_case", table_name="eval_results")
    op.drop_index("idx_eval_results_run", table_name="eval_results")
    op.drop_table("eval_results")

    op.drop_index("idx_eval_runs_agent_version", table_name="eval_runs")
    op.drop_index("idx_eval_runs_project_status", table_name="eval_runs")
    op.drop_index("idx_eval_runs_suite", table_name="eval_runs")
    op.drop_table("eval_runs")

    op.drop_table("eval_cases")
    op.drop_table("eval_suites")

    op.drop_index("idx_api_keys_project", table_name="api_keys")
    op.drop_index("idx_api_keys_prefix", table_name="api_keys")
    op.drop_table("api_keys")

    op.drop_table("projects")
