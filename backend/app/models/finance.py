from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text,
)
from sqlalchemy.orm import relationship

from app.core.db import Base


def utcnow():
    return datetime.now(timezone.utc)


DEFAULT_PRIORITIES = ["buffer", "obligations", "goals", "investing", "discretionary"]


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(120))
    password_hash = Column(String(255), nullable=False)

    # Onboarding answers -- these are the arbitrator's inputs.
    income_type = Column(String(40), default="variable")   # variable | salaried | mixed
    risk_tolerance = Column(Integer, default=50)           # 0 conservative .. 100 aggressive
    priorities = Column(JSON, default=list)                # ordered; drives arbitration
    buffer_floor = Column(Float, default=10000.0)
    monthly_baseline = Column(Float, default=0.0)
    currency = Column(String(8), default="INR")

    onboarded = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    obligations = relationship("Obligation", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "income_type": self.income_type,
            "risk_tolerance": self.risk_tolerance,
            "priorities": self.priorities or list(DEFAULT_PRIORITIES),
            "buffer_floor": self.buffer_floor,
            "monthly_baseline": self.monthly_baseline,
            "currency": self.currency,
            "onboarded": bool(self.onboarded),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    amount = Column(Float, nullable=False)
    direction = Column(String(8), nullable=False)          # CREDIT | DEBIT
    merchant = Column(String(160))
    category = Column(String(40), default="Unknown")
    account_hint = Column(String(40))                      # e.g. "HDFC XX4521"
    channel = Column(String(24))                           # UPI | CARD | NETBANKING | ATM | CASH
    occurred_at = Column(DateTime, index=True)

    is_recurring = Column(Boolean, default=False)
    obligation_id = Column(Integer, ForeignKey("obligations.id"), nullable=True)

    confidence = Column(Float, default=0.5)
    has_conflict = Column(Boolean, default=False)
    needs_review = Column(Boolean, default=False)
    dedupe_key = Column(String(120), index=True)

    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="transactions")
    evidence = relationship(
        "TransactionEvidence", back_populates="transaction", cascade="all, delete-orphan"
    )

    def to_dict(self, with_evidence=False):
        data = {
            "id": self.id,
            "amount": round(self.amount or 0, 2),
            "direction": self.direction,
            "merchant": self.merchant,
            "category": self.category,
            "account_hint": self.account_hint,
            "channel": self.channel,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else None,
            "is_recurring": bool(self.is_recurring),
            "confidence": round(self.confidence or 0, 3),
            "has_conflict": bool(self.has_conflict),
            "needs_review": bool(self.needs_review),
            "evidence_count": len(self.evidence),
        }
        if with_evidence:
            data["evidence"] = [e.to_dict() for e in self.evidence]
        return data


Index("ix_txn_user_time", Transaction.user_id, Transaction.occurred_at)


class TransactionEvidence(Base):
    """Every transaction keeps the raw artefacts that proved it."""

    __tablename__ = "transaction_evidence"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), index=True)

    source_type = Column(String(16))          # SMS | EMAIL | OCR | MANUAL
    sender = Column(String(80))               # e.g. "HDFCBK"
    raw_content = Column(Text)
    source_confidence = Column(Float, default=0.5)
    parsed_fields = Column(JSON)
    received_at = Column(DateTime, default=utcnow)

    transaction = relationship("Transaction", back_populates="evidence")

    def to_dict(self):
        return {
            "id": self.id,
            "source_type": self.source_type,
            "sender": self.sender,
            "raw_content": (self.raw_content or "")[:400],
            "source_confidence": round(self.source_confidence or 0, 3),
            "received_at": self.received_at.isoformat() if self.received_at else None,
        }


class Obligation(Base):
    """A recurring commitment DISCOVERED from history -- never configured by hand."""

    __tablename__ = "obligations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    name = Column(String(160))
    category = Column(String(40))
    expected_amount = Column(Float)
    cadence_days = Column(Integer, default=30)
    next_due = Column(DateTime)
    last_seen = Column(DateTime)
    occurrences = Column(Integer, default=0)
    confidence = Column(Float, default=0.3)
    status = Column(String(16), default="active")   # active | dormant
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="obligations")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "expected_amount": round(self.expected_amount or 0, 2),
            "cadence_days": self.cadence_days,
            "next_due": self.next_due.isoformat() if self.next_due else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "occurrences": self.occurrences,
            "confidence": round(self.confidence or 0, 3),
            "status": self.status,
        }


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    name = Column(String(160))
    target_amount = Column(Float)
    saved_amount = Column(Float, default=0.0)
    target_date = Column(DateTime, nullable=True)
    kind = Column(String(24), default="savings")   # savings | investment | debt
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        progress = 0.0
        if self.target_amount:
            progress = min(1.0, (self.saved_amount or 0) / self.target_amount)
        return {
            "id": self.id,
            "name": self.name,
            "target_amount": round(self.target_amount or 0, 2),
            "saved_amount": round(self.saved_amount or 0, 2),
            "progress": round(progress, 3),
            "target_date": self.target_date.isoformat() if self.target_date else None,
            "kind": self.kind,
        }


class Snapshot(Base):
    """An immutable record of the financial state the agent reasoned over."""

    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    ref = Column(String(32), index=True)          # human-citable id, e.g. SNP-4F2A
    payload = Column(JSON)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        data = {
            "id": self.id,
            "ref": self.ref,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        data.update(self.payload or {})
        return data


class Insight(Base):
    """A surfaced risk / opportunity card."""

    __tablename__ = "insights"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    kind = Column(String(32))              # risk | opportunity | information
    detector = Column(String(40))
    title = Column(String(200))
    body = Column(Text)
    reasoning = Column(Text)
    evidence_refs = Column(JSON)           # [{label, value, source}]
    magnitude = Column(Float, default=0.0)
    score = Column(Float, default=0.0)
    severity = Column(String(16), default="info")   # info | warn | critical
    snapshot_ref = Column(String(32))

    status = Column(String(16), default="active")   # active | dismissed | acted
    dismissed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "detector": self.detector,
            "title": self.title,
            "body": self.body,
            "reasoning": self.reasoning,
            "evidence": self.evidence_refs or [],
            "magnitude": round(self.magnitude or 0, 2),
            "score": round(self.score or 0, 3),
            "severity": self.severity,
            "snapshot_ref": self.snapshot_ref,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AgentRun(Base):
    """Audit log -- what the agent considered, surfaced, and suppressed."""

    __tablename__ = "agent_runs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    trigger = Column(String(32))             # manual | ingest | schedule
    snapshot_ref = Column(String(32))
    signals_considered = Column(Integer, default=0)
    surfaced = Column(JSON)                  # [{title, score, reason}]
    suppressed = Column(JSON)                # [{title, score, reason}]
    arbitration = Column(JSON)               # {priorities, risk_tolerance, winner, waterfall}
    duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "trigger": self.trigger,
            "snapshot_ref": self.snapshot_ref,
            "signals_considered": self.signals_considered,
            "surfaced": self.surfaced or [],
            "suppressed": self.suppressed or [],
            "arbitration": self.arbitration or {},
            "duration_ms": self.duration_ms,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    role = Column(String(16))                 # user | assistant
    content = Column(Text)
    cited_snapshot_ref = Column(String(32))
    grounding = Column(JSON)                  # [{label, value}]
    engine = Column(String(32))               # gemma4:12b | rules
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "cited_snapshot_ref": self.cited_snapshot_ref,
            "grounding": self.grounding or [],
            "engine": self.engine,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Device(Base):
    """A paired Android capture client."""

    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    label = Column(String(120))
    platform = Column(String(24), default="android")
    last_sync_at = Column(DateTime)
    messages_ingested = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "platform": self.platform,
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "messages_ingested": self.messages_ingested,
        }
