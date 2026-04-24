"""Runtime compatibility shim for Qwen1's trust_remote_code modeling_qwen.

Qwen1's legacy ``modeling_qwen.py`` was written when ``past_key_values`` was a
tuple-of-tuples-of-tensors. Transformers 4.57 passes a ``DynamicCache`` (or
other :class:`transformers.cache_utils.Cache`) object instead, which the
legacy code indexes as ``past_key_values[0][0]`` and crashes.

This shim monkey-patches the loaded ``QWenModel.forward`` to convert any
non-tuple ``past_key_values`` to legacy tuple format before the original
code runs. The patch is idempotent and safe to call multiple times.

Usage:
    model = AutoModelForCausalLM.from_pretrained(path, trust_remote_code=True)
    from yuholens.compat.qwen1_cache_compat import install
    install(model)
"""

from __future__ import annotations

import functools
import sys
from typing import Any


def _find_qwen_model_class() -> type | None:
    """Return ``QWenModel`` from a loaded Qwen1 trust_remote_code module.

    Scans ``sys.modules`` for entries whose name contains ``modeling_qwen``
    — the conventional filename for Qwen1's bundled modeling code under
    ``transformers_modules.*``. Avoids probing unrelated ``transformers``
    namespaces that raise deprecation aliases for the ``QWenModel`` name.
    """
    for name, module in list(sys.modules.items()):
        if module is None:
            continue
        if "modeling_qwen" not in name:
            continue
        cls = getattr(module, "QWenModel", None)
        if cls is not None and getattr(cls, "forward", None) is not None:
            return cls
    return None


def _strip_empty_placeholder(legacy: Any) -> Any:
    """Detect transformers 4.57's pre-allocated-but-empty cache placeholder.

    After ``DynamicCache.early_initialization`` (which ``generate()`` calls
    implicitly), ``to_legacy_cache()`` returns a tuple with one ``(None,
    None)`` entry per hidden layer rather than an empty tuple. Qwen1's code
    indexes ``past_key_values[0][0]`` unconditionally on the ``kv_seq_len``
    path, so we must collapse this placeholder back to ``None`` to trigger
    the legitimate "first pass" branch.

    Returns:
        ``None`` when ``legacy`` is empty or every layer is a ``(None, None)``
        tuple; otherwise returns ``legacy`` unchanged.
    """
    if legacy is None or len(legacy) == 0:
        return None
    first = legacy[0]
    if first is None:
        return None
    if isinstance(first, tuple) and (len(first) == 0 or first[0] is None):
        return None
    return legacy


def _normalise_past_key_values(past_key_values: Any) -> Any:
    """Return either ``None`` or a legacy tuple-of-tuples-of-tensors.

    Accepts:
        * ``None`` (pass-through).
        * tuple (pass-through — already legacy).
        * :class:`transformers.cache_utils.Cache` subclass — convert via
          ``to_legacy_cache()`` when available (transformers 4.36 - 4.57), or
          fall back to zipping the cache's ``key_cache`` and ``value_cache``
          lists (survives the 5.x removal of ``to_legacy_cache``).

    When a cache has no accumulated tokens, returns ``None`` so the Qwen1
    legacy code enters its "first pass" branch cleanly.
    """
    if past_key_values is None:
        return None
    if isinstance(past_key_values, tuple):
        return past_key_values

    # Preferred path: Cache objects in transformers 4.36-4.57 ship a
    # ``to_legacy_cache()`` helper that returns exactly the tuple format
    # Qwen1 expects.
    to_legacy = getattr(past_key_values, "to_legacy_cache", None)
    if callable(to_legacy):
        legacy = to_legacy()
        legacy = _strip_empty_placeholder(legacy)
        if legacy is None:
            return None
        return legacy

    # Fallback: build legacy tuple manually from the per-layer key/value
    # lists exposed by ``DynamicCache``. Survives transformers 5.x where
    # ``to_legacy_cache`` was removed.
    key_cache = getattr(past_key_values, "key_cache", None)
    value_cache = getattr(past_key_values, "value_cache", None)
    if isinstance(key_cache, list) and isinstance(value_cache, list):
        if len(key_cache) == 0 or len(key_cache) != len(value_cache):
            return None
        legacy = tuple((k, v) for k, v in zip(key_cache, value_cache))
        return _strip_empty_placeholder(legacy)

    # Only now trust ``get_seq_length == 0`` as the "empty" signal, as a
    # last resort before dropping unknown cache state.
    get_seq_length = getattr(past_key_values, "get_seq_length", None)
    if callable(get_seq_length):
        try:
            if get_seq_length() == 0:
                return None
        except Exception:
            pass
    return None


def _cache_has_content(past_key_values: Any) -> bool:
    """Return True iff the cache already holds at least one cached token.

    Treats the Qwen1 ``if past_key_values:`` truthy check as ``is-non-None
    and non-empty``, which matters because ``DynamicCache()`` (transformers
    4.57's default starting state) is truthy but empty and would mislead
    Qwen1's ``prepare_inputs_for_generation`` into slicing the prompt.
    """
    if past_key_values is None:
        return False
    if isinstance(past_key_values, tuple):
        if len(past_key_values) == 0:
            return False
        first = past_key_values[0]
        if first is None:
            return False
        if isinstance(first, tuple) and (len(first) == 0 or first[0] is None):
            return False
        return True
    get_seq_length = getattr(past_key_values, "get_seq_length", None)
    if callable(get_seq_length):
        try:
            return get_seq_length() > 0
        except Exception:
            pass
    return False


def _find_lm_head_class(qwen_cls: type, model: Any | None = None) -> type | None:
    """Return the actual ``QWenLMHeadModel`` class of the loaded model.

    Prefers ``type(model)`` when a model is provided — transformers'
    trust_remote_code loader can wrap the original class or assign aliases,
    so the module-level ``QWenLMHeadModel`` may not be the class of the
    instantiated model. Falling back to the module attribute lets this
    function still work in test contexts without a model.
    """
    import inspect

    if model is not None:
        cls = type(model)
        if cls.__name__ == "QWenLMHeadModel":
            return cls
        for mro_cls in cls.__mro__:
            if mro_cls.__name__ == "QWenLMHeadModel":
                return mro_cls
    mod = inspect.getmodule(qwen_cls)
    if mod is None:
        return None
    return getattr(mod, "QWenLMHeadModel", None)


def install(model: Any | None = None) -> bool:
    """Monkey-patch Qwen1 model methods to accept transformers 4.57 caches.

    Patches both ``QWenModel.forward`` (to convert ``Cache`` → legacy tuple
    on entry) and ``QWenLMHeadModel.prepare_inputs_for_generation`` (to fix
    the truthy-empty-cache bug that slices the prompt to the last token).

    Args:
        model: Optional loaded model. If provided, its class is patched
            directly. If ``None``, scan ``sys.modules`` for any loaded
            trust_remote_code module exposing ``QWenModel``.

    Returns:
        True if at least one patch was newly applied. Raises
        ``RuntimeError`` if no ``QWenModel`` class is found.
    """
    qwen_cls: type | None
    if model is not None:
        qwen_cls = _find_qwen_model_in_module(model)
    else:
        qwen_cls = _find_qwen_model_class()
    if qwen_cls is None:
        raise RuntimeError(
            "QWenModel class not found; load the model with trust_remote_code=True "
            "before calling install()."
        )

    applied = False

    if not getattr(qwen_cls.forward, "_qwen1_cache_compat_patched", False):
        original_forward = qwen_cls.forward

        @functools.wraps(original_forward)
        def patched_forward(self, *args, **kwargs):
            if "past_key_values" in kwargs:
                kwargs["past_key_values"] = _normalise_past_key_values(
                    kwargs["past_key_values"]
                )
            else:
                args = list(args)
                if len(args) >= 2:
                    args[1] = _normalise_past_key_values(args[1])
                args = tuple(args)
            return original_forward(self, *args, **kwargs)

        patched_forward._qwen1_cache_compat_patched = True  # type: ignore[attr-defined]
        qwen_cls.forward = patched_forward
        applied = True

    lm_cls = _find_lm_head_class(qwen_cls, model)
    if lm_cls is not None and not getattr(
        lm_cls.prepare_inputs_for_generation,
        "_qwen1_cache_compat_patched",
        False,
    ):
        original_prepare = lm_cls.prepare_inputs_for_generation

        @functools.wraps(original_prepare)
        def patched_prepare(
            self, input_ids, past_key_values=None, inputs_embeds=None, **kwargs
        ):
            if _cache_has_content(past_key_values):
                input_ids = input_ids[:, -1].unsqueeze(-1)
            if input_ids.size(0) == 1:
                attention_mask = None
            else:
                attention_mask = kwargs.get("attention_mask", None)
            if inputs_embeds is not None and not _cache_has_content(past_key_values):
                model_inputs = {"inputs_embeds": inputs_embeds}
            else:
                model_inputs = {"input_ids": input_ids}
            model_inputs.update(
                {
                    "past_key_values": past_key_values,
                    "use_cache": kwargs.get("use_cache"),
                    "attention_mask": attention_mask,
                }
            )
            return model_inputs

        patched_prepare._qwen1_cache_compat_patched = True  # type: ignore[attr-defined]
        lm_cls.prepare_inputs_for_generation = patched_prepare
        applied = True

    return applied


def _find_qwen_model_in_module(model: Any) -> type | None:
    """Return the actual ``QWenModel`` class used by ``model``.

    Prefers ``type(model.transformer)`` — the transformer sub-module is
    always a ``QWenModel`` instance in ``QWenLMHeadModel.__init__``. Falls
    back to MRO module scanning, then to the global sys.modules scan, so
    this function still succeeds in test contexts with no live model.
    """
    import inspect

    transformer = getattr(model, "transformer", None)
    if transformer is not None:
        cls = type(transformer)
        if cls.__name__ == "QWenModel":
            return cls

    for cls in type(model).__mro__:
        mod = inspect.getmodule(cls)
        if mod is None:
            continue
        mod_name = getattr(mod, "__name__", "")
        if "modeling_qwen" not in mod_name:
            continue
        qwen = getattr(mod, "QWenModel", None)
        if qwen is not None:
            return qwen
    return _find_qwen_model_class()
