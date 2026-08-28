"""Signal detectors.

Each detector is a pure function over a state dict and returns Signal objects
with the evidence that justified them. Pure + evidence-carrying means every
card the user sees can be traced back to real numbers.
"""
from dataclasses import dataclass, field


@dataclass
class Signal:
    detector: str
    objective: str          # buffer | obligations | goals | investing | discretionary
    kind: str               # risk | opportunity | information
    title: str
    body: str
    magnitude: float        # rupee impact -- drives scoring
    severity: str = "info"  # info | warn | critical
    evidence: list = field(default_factory=list)
    reasoning: str = ""

    def key(self):
        return f"{self.detector}:{self.objective}"


from app.detectors.buffer import detect as detect_buffer            # noqa: E402
from app.detectors.income import detect as detect_income            # noqa: E402
from app.detectors.obligations import detect as detect_obligations  # noqa: E402
from app.detectors.spend import detect as detect_spend              # noqa: E402

ALL_DETECTORS = [detect_buffer, detect_obligations, detect_income, detect_spend]


def run_all(state, user):
    signals = []
    for detector in ALL_DETECTORS:
        try:
            signals.extend(detector(state, user) or [])
        except Exception as exc:  # a broken detector must not take down the tick
            print(f"[detector error] {detector.__module__}: {exc}")
    return signals
