from fastapi import APIRouter
from sqlalchemy import select, desc, or_, update
from app.core.deps import DbSession, CurrentUser
from app.models.notification import Notification

router = APIRouter()


@router.get("")
async def list_notifications(db: DbSession, user: CurrentUser, limit: int = 50, unread_only: bool = False):
    q = (
        select(Notification)
        .where(or_(Notification.user_id == user.id, Notification.user_id.is_(None)))
        .order_by(desc(Notification.id))
        .limit(limit)
    )
    if unread_only:
        q = q.where(Notification.is_read == False)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": n.id,
            "level": n.level,
            "title": n.title,
            "body": n.body,
            "link": n.link,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in rows
    ]


@router.get("/unread-count")
async def unread_count(db: DbSession, user: CurrentUser):
    rows = (
        await db.execute(
            select(Notification).where(
                or_(Notification.user_id == user.id, Notification.user_id.is_(None)),
                Notification.is_read == False,
            )
        )
    ).scalars().all()
    return {"count": len(rows)}


@router.post("/{nid}/read")
async def mark_read(nid: int, db: DbSession, user: CurrentUser):
    r = await db.execute(select(Notification).where(Notification.id == nid))
    n = r.scalar_one_or_none()
    if n:
        n.is_read = True
        await db.flush()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(db: DbSession, user: CurrentUser):
    rows = (
        await db.execute(
            select(Notification).where(
                or_(Notification.user_id == user.id, Notification.user_id.is_(None)),
                Notification.is_read == False,
            )
        )
    ).scalars().all()
    for n in rows:
        n.is_read = True
    await db.flush()
    return {"ok": True, "count": len(rows)}
