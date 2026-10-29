from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict

class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    model_config = ConfigDict(from_attributes=True)

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

class BookIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    author: str = Field(min_length=1, max_length=255)
    cover_image: str | None = None
    genre: str = Field(min_length=1, max_length=100)
    isbn: str = Field(min_length=1, max_length=30)
    total_copies: int = Field(ge=0)
    available_copies: int = Field(ge=0)
    description: str = ""

    @classmethod
    def validate_available(cls, values):
        if values.get("available_copies", 0) > values.get("total_copies", 0):
            raise ValueError("Available copies cannot exceed total copies")
        return values

class BookOut(BaseModel):
    id: int
    title: str
    author: str
    cover_image: str | None
    genre: str
    isbn: str
    total_copies: int
    available_copies: int
    description: str
    model_config = ConfigDict(from_attributes=True)

class BorrowingOut(BaseModel):
    id: int
    book_id: int
    book_title: str
    author: str
    borrowed_at: datetime
    due_at: datetime
    returned_at: datetime | None
    status: str


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=10, max_length=20)
    address: str = Field(min_length=5, max_length=500)

class ProfileOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    phone: str | None
    address: str | None
    profile_complete: bool
    model_config = ConfigDict(from_attributes=True)

class PasswordResetConfirmIn(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8, max_length=128)
