from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="member", nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    reset_code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reset_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

class Book(Base):
    __tablename__ = "books"
    __table_args__ = (
        UniqueConstraint("isbn", name="uq_books_isbn"),
        CheckConstraint("total_copies >= 0", name="ck_total_copies_nonnegative"),
        CheckConstraint("available_copies >= 0", name="ck_available_copies_nonnegative"),
        CheckConstraint("available_copies <= total_copies", name="ck_available_le_total"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    author: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    cover_image: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    genre: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    isbn: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    total_copies: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    available_copies: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)

class Borrowing(Base):
    __tablename__ = "borrowings"
    __table_args__ = (CheckConstraint("due_at >= borrowed_at", name="ck_due_after_borrow"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id"), nullable=False, index=True)
    borrowed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    user: Mapped[User] = relationship()
    book: Mapped[Book] = relationship()
