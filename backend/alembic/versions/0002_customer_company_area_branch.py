"""Add company, area, and branch fields to customers."""
from alembic import op
import sqlalchemy as sa


revision = "0002_customer_company_area_branch"
down_revision = "0001_proposal_discount_percent"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if "customers" not in sa.inspect(bind).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(bind).get_columns("customers")}
    for name in ("company_name", "area", "branch"):
        if name not in columns:
            op.add_column("customers", sa.Column(name, sa.String(255), nullable=True))


def downgrade():
    bind = op.get_bind()
    if "customers" not in sa.inspect(bind).get_table_names():
        return
    columns = {column["name"] for column in sa.inspect(bind).get_columns("customers")}
    for name in ("branch", "area", "company_name"):
        if name in columns:
            op.drop_column("customers", name)