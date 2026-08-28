import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, scoped_session

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SQLALCHEMY_DATABASE_URL = os.environ.get(
    "GLIDE_DATABASE_URL", "sqlite:///" + os.path.join(BASE_DIR, "glide.db")
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {},
    future=True,
)

SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
SessionLocal = scoped_session(SessionFactory)

Base = declarative_base()


def get_db():
    """Flask request-scoped session accessor."""
    return SessionLocal()


def remove_session(exc=None):
    SessionLocal.remove()
