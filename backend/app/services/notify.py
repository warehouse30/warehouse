from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import Notification


async def notify(
    db: AsyncSession,
    title: str,
    body: str | None = None,
    level: str = "info",
    link: str | None = None,
    user_id: int | None = None,
):
    n = Notification(title=title, body=body, level=level, link=link, user_id=user_id)
    db.add(n)
    await db.flush()
    return n
