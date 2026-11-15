import os
import time
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

import psycopg
from fastapi import APIRouter, FastAPI, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://expense:expense@db:5432/expenses"
)


def get_conn():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db():
    # Wait for the database, then create the table if it does not exist
    for attempt in range(30):
        try:
            with get_conn() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS expenses (
                        id SERIAL PRIMARY KEY,
                        title TEXT NOT NULL,
                        amount NUMERIC(10, 2) NOT NULL,
                        category TEXT NOT NULL DEFAULT 'General',
                        spent_on DATE NOT NULL DEFAULT CURRENT_DATE
                    )
                    """
                )
            return
        except psycopg.OperationalError:
            print(f"Database not ready, retry {attempt + 1}/30")
            time.sleep(2)
    raise RuntimeError("Could not connect to the database")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Expense Tracker API",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
router = APIRouter(prefix="/api")


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    amount: float = Field(gt=0)
    category: str = Field(default="General", max_length=50)
    spent_on: Optional[date] = None


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/expenses")
def list_expenses():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, title, amount::float AS amount, category, spent_on "
            "FROM expenses ORDER BY spent_on DESC, id DESC"
        ).fetchall()
    return rows


@router.post("/expenses", status_code=201)
def add_expense(item: ExpenseIn):
    spent_on = item.spent_on or date.today()
    with get_conn() as conn:
        row = conn.execute(
            "INSERT INTO expenses (title, amount, category, spent_on) "
            "VALUES (%s, %s, %s, %s) "
            "RETURNING id, title, amount::float AS amount, category, spent_on",
            (item.title, item.amount, item.category, spent_on),
        ).fetchone()
    return row


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM expenses WHERE id = %s", (expense_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Expense not found")
    return {"deleted": expense_id}


@router.get("/summary")
def summary():
    with get_conn() as conn:
        total = conn.execute(
            "SELECT COALESCE(SUM(amount), 0)::float AS total FROM expenses"
        ).fetchone()["total"]
        by_category = conn.execute(
            "SELECT category, SUM(amount)::float AS total "
            "FROM expenses GROUP BY category ORDER BY total DESC"
        ).fetchall()
    return {"total": total, "by_category": by_category}


app.include_router(router)
