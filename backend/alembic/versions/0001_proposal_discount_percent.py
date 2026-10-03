"""Add proposal discount percentage."""
from alembic import op
import sqlalchemy as sa


revision = "0001_proposal_discount_percent"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if "proposals" not in sa.inspect(bind).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(bind).get_columns("proposals")}
    if "discount_percent" not in columns:
        op.add_column(
            "proposals",
            sa.Column("discount_percent", sa.Numeric(8, 4), nullable=False, server_default="0"),
        )


def downgrade():
    bind = op.get_bind()
    if "proposals" not in sa.inspect(bind).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(bind).get_columns("proposals")}
    if "discount_percent" in columns:
        op.drop_column("proposals", "discount_percent")