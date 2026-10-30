from datetime import datetime, timedelta
import hashlib
import hmac
import secrets
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .config import settings
from .database import Base, engine, get_db
from .models import User, Book, Borrowing
from .schemas import RegisterIn, LoginIn, UserOut, TokenOut, BookIn, BookOut, BorrowingOut, ProfileUpdate, ProfileOut, PasswordResetConfirmIn
from .security import hash_password, verify_password, create_access_token, get_current_user, require_admin
from fastapi.security import OAuth2PasswordRequestForm

app = FastAPI(title="Library Management API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "https://frontend-8u9pxe8na-arthigs-projects.vercel.app",
        "https://frontend-bs6dv7qy5-arthigs-projects.vercel.app",
        "https://frontend-defb6k1a0-arthigs-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"message": "Library Management API", "docs": "/docs"}

@app.post("/auth/register", response_model=UserOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()

    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email is already registered")

    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password)
    )

    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email is already registered")

    return user
@app.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()

    user = db.scalar(select(User).where(User.email == email))

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": user
    }

@app.post("/auth/token")
def swagger_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    print("DATABASE:", db.execute(
    select(func.current_database())
).scalar())
    email = form_data.username.strip().lower()

    user = db.scalar(
        select(User).where(User.email == email)
    )

    print("EMAIL ENTERED:", email)
    print("USER FOUND:", user is not None)

    if user:
        print("USER ROLE:", user.role)

        password_valid = verify_password(
            form_data.password,
            user.password_hash
        )

        print("PASSWORD MATCH:", password_valid)

        if not password_valid:
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"}
            )
    else:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return {
        "access_token": create_access_token(user),
        "token_type": "bearer"
    }

@app.post("/auth/password-reset-request")
def password_reset_request(email: str = Query(...), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user:
        code = f"{secrets.randbelow(1_000_000):06d}"
        user.reset_code_hash = _reset_code_digest(code)
        user.reset_code_expires_at = datetime.utcnow() + timedelta(minutes=10)
        db.commit()
        # Local-development delivery only. Configure an email provider before deployment.
        print(f"[DEV PASSWORD RESET] {user.email}: {code} (expires in 10 minutes)")
    # Same response whether the email exists or not.
    return {"message": "If the account exists, reset instructions will be sent."}

@app.post("/auth/password-reset-confirm")
def password_reset_confirm(payload: PasswordResetConfirmIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))  
    if not user or not user.reset_code_hash or not user.reset_code_expires_at:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    digest = _reset_code_digest(payload.code)
    if (not hmac.compare_digest(digest, user.reset_code_hash)
            or user.reset_code_expires_at < datetime.utcnow()):
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    user.password_hash = hash_password(payload.new_password)
    user.reset_code_hash = None
    user.reset_code_expires_at = None
    db.commit()
    return {"message": "Password reset successful. Please sign in with your new password."}

@app.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user

def profile_is_complete(user: User) -> bool:
    return bool(user.name and user.name.strip() and user.phone and user.phone.strip()
                and user.address and user.address.strip())

@app.get("/profile", response_model=ProfileOut)
def get_profile(user: User = Depends(get_current_user)):
    return {
        "id": user.id, "name": user.name, "email": user.email, "role": user.role,
        "phone": user.phone, "address": user.address,
        "profile_complete": profile_is_complete(user),
    }

@app.put("/profile", response_model=ProfileOut)
def update_profile(payload: ProfileUpdate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    name, phone, address = payload.name.strip(), payload.phone.strip(), payload.address.strip()
    if not name or len(phone) < 10 or not address:
        raise HTTPException(status_code=422, detail="Complete all required profile fields with valid values")
    user.name, user.phone, user.address = name, phone, address
    db.commit()
    db.refresh(user)
    return {
        "id": user.id, "name": user.name, "email": user.email, "role": user.role,
        "phone": user.phone, "address": user.address,
        "profile_complete": profile_is_complete(user),
    }

@app.get("/books", response_model=list[BookOut])
def list_books(
    search: str | None = None,
    genre: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(Book)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(or_(Book.title.ilike(pattern), Book.author.ilike(pattern)))
    if genre:
        stmt = stmt.where(Book.genre.ilike(genre.strip()))
    return list(db.scalars(stmt.order_by(Book.title)).all())

@app.get("/books/{book_id}", response_model=BookOut)
def get_book(book_id: int, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book

@app.post("/books", response_model=BookOut, status_code=201)
def create_book(payload: BookIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if payload.available_copies > payload.total_copies:
        raise HTTPException(status_code=422, detail="Available copies cannot exceed total copies")
    book = Book(**payload.model_dump())
    db.add(book)
    try:
        db.commit()
        db.refresh(book)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="ISBN must be unique")
    return book

@app.put("/books/{book_id}", response_model=BookOut)
def update_book(book_id: int, payload: BookIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    book = db.scalar(select(Book).where(Book.id == book_id).with_for_update())
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    active = db.scalar(select(func.count(Borrowing.id)).where(
        Borrowing.book_id == book_id, Borrowing.returned_at.is_(None)
    )) or 0
    if payload.total_copies < active:
        raise HTTPException(status_code=409, detail="Total copies cannot be lower than active borrowings")
    if payload.available_copies > payload.total_copies - active:
        raise HTTPException(status_code=422, detail="Available copies exceed copies not currently borrowed")
    for key, value in payload.model_dump().items():
        setattr(book, key, value)
    try:
        db.commit()
        db.refresh(book)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="ISBN must be unique")
    return book

def borrowing_out(row: Borrowing) -> BorrowingOut:
    status = "Returned" if row.returned_at else ("Overdue" if row.due_at < datetime.utcnow() else "Borrowed")
    return BorrowingOut(
        id=row.id, book_id=row.book_id, book_title=row.book.title, author=row.book.author,
        borrowed_at=row.borrowed_at, due_at=row.due_at, returned_at=row.returned_at, status=status
    )

@app.post("/borrowings/{book_id}", response_model=BorrowingOut, status_code=201)
def borrow_book(book_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == "member" and not profile_is_complete(user):
        raise HTTPException(status_code=403, detail="Please complete your profile before borrowing books")
    # On PostgreSQL, row locking serializes requests competing for the last copy.
    book = db.scalar(select(Book).where(Book.id == book_id).with_for_update())
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.available_copies <= 0:
        raise HTTPException(status_code=409, detail="No copies are currently available")
    active_count = db.scalar(select(func.count(Borrowing.id)).where(
        Borrowing.user_id == user.id, Borrowing.returned_at.is_(None)
    )) or 0
    if active_count >= 3:
        raise HTTPException(status_code=409, detail="You cannot borrow more than three books at a time")
    duplicate = db.scalar(select(Borrowing.id).where(
        Borrowing.user_id == user.id,
        Borrowing.book_id == book_id,
        Borrowing.returned_at.is_(None)
    ))
    if duplicate:
        raise HTTPException(status_code=409, detail="You already have this book borrowed")
    book.available_copies -= 1
    row = Borrowing(user_id=user.id, book_id=book.id, borrowed_at=datetime.utcnow(),
                    due_at=datetime.utcnow() + timedelta(days=14))
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise
    return borrowing_out(row)

@app.post("/borrowings/{borrowing_id}/return", response_model=BorrowingOut)
def return_book(borrowing_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.scalar(select(Borrowing).where(Borrowing.id == borrowing_id).with_for_update())
    if not row:
        raise HTTPException(status_code=404, detail="Borrowing record not found")
    if row.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="You can only return your own borrowing")
    if row.returned_at is not None:
        raise HTTPException(status_code=409, detail="This book has already been returned")
    book = db.scalar(select(Book).where(Book.id == row.book_id).with_for_update())
    row.returned_at = datetime.utcnow()
    book.available_copies = min(book.total_copies, book.available_copies + 1)
    db.commit()
    db.refresh(row)
    return borrowing_out(row)

@app.get("/borrowings/me", response_model=list[BorrowingOut])
def my_borrowings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Borrowing).where(Borrowing.user_id == user.id).order_by(Borrowing.borrowed_at.desc())).all()
    return [borrowing_out(row) for row in rows]

@app.get("/recommendations/me", response_model=list[BookOut])
def recommendations_for_member(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Lightweight content-based recommendations: prioritize genres from the member's
    # previous loans, then available books. This runs locally and needs no external AI key.
    rows = db.scalars(select(Borrowing).where(Borrowing.user_id == user.id)
                      .order_by(Borrowing.borrowed_at.desc())).all()
    preferred_genres = []
    for row in rows:
        genre_value = row.book.genre
        if genre_value not in preferred_genres:
            preferred_genres.append(genre_value)
    borrowed_ids = [row.book_id for row in rows if row.returned_at is None]
    stmt = select(Book).where(Book.available_copies > 0)
    if borrowed_ids:
        stmt = stmt.where(Book.id.not_in(borrowed_ids))
    books_list = list(db.scalars(stmt).all())
    if preferred_genres:
        books_list.sort(key=lambda book: (preferred_genres.index(book.genre) if book.genre in preferred_genres else len(preferred_genres), book.title.lower()))
    else:
        books_list.sort(key=lambda book: (-book.available_copies, book.title.lower()))
    return books_list[:6]

@app.get("/dashboard/member")
def member_dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Borrowing).where(
        Borrowing.user_id == user.id, Borrowing.returned_at.is_(None)
    ).order_by(Borrowing.due_at)).all()
    return {
        "currently_borrowed": len(rows),
        "overdue": sum(1 for row in rows if row.due_at < datetime.utcnow()),
        "borrowings": [borrowing_out(row).model_dump() for row in rows],
    }

@app.get("/dashboard/admin")
def admin_dashboard(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    active = db.scalar(select(func.count(Borrowing.id)).where(Borrowing.returned_at.is_(None))) or 0
    overdue = db.scalar(select(func.count(Borrowing.id)).where(
        Borrowing.returned_at.is_(None), Borrowing.due_at < datetime.utcnow()
    )) or 0
    low = db.scalars(select(Book).where(Book.available_copies <= 1).order_by(Book.available_copies)).all()
    return {
        "total_members": db.scalar(select(func.count(User.id)).where(User.role == "member")) or 0,
        "total_books": db.scalar(select(func.count(Book.id))) or 0,
        "active_borrowings": active,
        "overdue_borrowings": overdue,
        "low_availability": [{"id": b.id, "title": b.title, "available_copies": b.available_copies} for b in low],
    }
