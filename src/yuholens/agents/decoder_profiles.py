"""Decoder-profile catalogue for the best-of-N memo composer.

The KG-2 PASS configuration on 2026-04-25 lifted mean coherence from 3.56
single-shot to 3.88 best-of-5 by sampling the same SFT checkpoint at five
different ``(temperature, top_p, repetition_penalty, no_repeat_ngram_size,
seed)`` tuples and letting the coherence judge pick the winner per prompt.
In our small-N setting, decoder diversity appears to contribute more
lift than seed diversity (the bo2-vs-bo3 difference is 0.08 at n=50,
within a one-SE noise band, so this is a trend rather than a
significance claim), so the default catalogue combines two
perturbed-decoder variants (v4-style mixed) with three v5-profile
fixed-decoder seeds.

This module exists so the LangGraph composer can ship the same five-way
fan-out behaviour without each caller hand-rolling the tuple list.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class DecoderProfile:
    """Sampling configuration for a single best-of-N candidate.

    Attributes:
        name: Stable human-readable identifier; surfaces in score logs and
            pick-share summaries.
        temperature: HuggingFace ``generate()`` temperature.
        top_p: Nucleus-sampling cutoff.
        repetition_penalty: ``>1.0`` discourages token repeats; matches
            ``run_kg2.py``'s ``--repetition-penalty`` flag.
        no_repeat_ngram_size: ``0`` disables the n-gram block; values
            greater than zero have empirically fragmented mid-memo
            financial terminology in KG-2 v3.
        seed: Optional integer forwarded to ``torch.manual_seed`` and
            ``transformers.set_seed`` so candidate sets are reproducible.
            ``None`` lets the caller's global seed govern.
    """

    name: str
    temperature: float
    top_p: float
    repetition_penalty: float
    no_repeat_ngram_size: int
    seed: int | None = None


def validate_profile(profile: DecoderProfile) -> None:
    """Reject profiles whose values fall outside the supported decoder ranges.

    Args:
        profile: Candidate decoder profile.

    Raises:
        ValueError: If any field is outside the empirically tested range.
    """
    if not profile.name:
        raise ValueError("decoder profile name must be non-empty")
    if not 0.0 < profile.temperature <= 2.0:
        raise ValueError(
            f"temperature must be in (0.0, 2.0]; got {profile.temperature}"
        )
    if not 0.0 < profile.top_p <= 1.0:
        raise ValueError(f"top_p must be in (0.0, 1.0]; got {profile.top_p}")
    if not 0.5 <= profile.repetition_penalty <= 2.0:
        raise ValueError(
            "repetition_penalty must be in [0.5, 2.0]; got "
            f"{profile.repetition_penalty}"
        )
    if profile.no_repeat_ngram_size < 0:
        raise ValueError(
            "no_repeat_ngram_size must be >= 0; got "
            f"{profile.no_repeat_ngram_size}"
        )
    if profile.seed is not None and profile.seed < 0:
        raise ValueError(f"seed must be non-negative or None; got {profile.seed}")


DEFAULT_PROFILES: tuple[DecoderProfile, ...] = (
    DecoderProfile(
        name="v4_mixed_warm",
        temperature=0.20,
        top_p=0.9,
        repetition_penalty=1.10,
        no_repeat_ngram_size=0,
        seed=4040,
    ),
    DecoderProfile(
        name="v4_mixed_warmer",
        temperature=0.15,
        top_p=0.9,
        repetition_penalty=1.125,
        no_repeat_ngram_size=0,
        seed=4141,
    ),
    DecoderProfile(
        name="v5_seed_a",
        temperature=0.10,
        top_p=0.9,
        repetition_penalty=1.15,
        no_repeat_ngram_size=0,
        seed=5151,
    ),
    DecoderProfile(
        name="v5_seed_b",
        temperature=0.10,
        top_p=0.9,
        repetition_penalty=1.15,
        no_repeat_ngram_size=0,
        seed=5252,
    ),
    DecoderProfile(
        name="v5_seed_c",
        temperature=0.10,
        top_p=0.9,
        repetition_penalty=1.15,
        no_repeat_ngram_size=0,
        seed=5353,
    ),
)


def validate_profiles(profiles: Iterable[DecoderProfile]) -> tuple[DecoderProfile, ...]:
    """Validate a profile sequence and return it as a tuple.

    Args:
        profiles: Iterable of decoder profiles, typically the output of
            ``DEFAULT_PROFILES`` or a caller-supplied override.

    Returns:
        The same profiles as a tuple, in input order.

    Raises:
        ValueError: When the iterable is empty, contains duplicate names,
            or any individual profile fails :func:`validate_profile`.
    """
    materialised = tuple(profiles)
    if not materialised:
        raise ValueError("profile list must contain at least one profile")
    seen: set[str] = set()
    for profile in materialised:
        validate_profile(profile)
        if profile.name in seen:
            raise ValueError(f"duplicate profile name: {profile.name}")
        seen.add(profile.name)
    return materialised


__all__ = [
    "DEFAULT_PROFILES",
    "DecoderProfile",
    "validate_profile",
    "validate_profiles",
]
