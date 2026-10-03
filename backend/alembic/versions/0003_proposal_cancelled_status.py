"""Add cancelled proposal status for PostgreSQL enum."""
from alembic import op


revision = "0003_proposal_cancelled_status"
down_revision = "0002_customer_company_area_branch"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE proposalstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade():
    pass