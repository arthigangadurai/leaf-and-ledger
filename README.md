# Library Management System

Full-stack assessment starter using React + Vite, FastAPI, SQLAlchemy, and PostgreSQL.

## Features
- Registration and login with hashed passwords and JWT authentication\n- Member profile management (name, phone, address) with a backend borrowing gate\n- Password reset code flow (local development prints the code in the backend terminal; email provider required for deployment)
- Book catalog, search by title/author, genre filter, book detail
- Member borrowing, returning, own borrowing history\n- Book detail modal and personalized content-based recommendations
- Member dashboard and admin dashboard
- Admin book create/edit
- 14-day loans, three active loans maximum, availability checks, duplicate-loan prevention
- Backend validation and role checks

## Important limitations
This is a development starter, not a production-ready system. Password-reset codes are printed only in the backend terminal for local development and expire after 10 minutes. Configure an email provider and rate limiting before deployment. The recommendation feature is a lightweight content-based baseline that prioritizes genres from the member's borrowing history; it does not call an external generative AI service. Test concurrency using PostgreSQL; SQLite is not a substitute for PostgreSQL row locking.

## Requirements
- Python 3.11+
- Node.js 20+
- PostgreSQL 14+

## 1. Create a PostgreSQL database
Create a database and user, for example:
```sql
CREATE USER library_user WITH PASSWORD 'change_this_password';
CREATE DATABASE library_db OWNER library_user;
```

## 2. Start the backend
```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
```
Copy `.env.example` to `.env` and set `DATABASE_URL` and `SECRET_KEY`.
```bash
uvicorn app.main:app --reload
```
API docs: http://127.0.0.1:8000/docs

The app creates new tables on startup for assessment convenience, but `create_all` does not add columns to existing tables. For an existing PostgreSQL database, back up the database and run `backend/migrations/001_user_profile_password_reset.sql` once before restarting the backend. For SQLite, use a fresh development database or add the equivalent columns with SQLite-compatible `ALTER TABLE` statements. For production, use Alembic migrations.

## 3. Create an admin
Register a user through the UI or API. Then promote that account in PostgreSQL:
```sql
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
```
Log out and log back in to receive a token with the admin role.

## 4. Start the frontend
```bash
cd frontend
npm install
npm run dev
```
Open the URL printed by Vite (usually http://localhost:5173).

## Demo flow
1. Register a member and log in.
2. Add books as an admin (promote your account using SQL first).
3. Borrow a book, view the dashboard/history, and return it.
4. Test invalid cases using the UI or Swagger.

## Configuration
Frontend API base URL is read from `VITE_API_URL` and defaults to `http://127.0.0.1:8000`.
