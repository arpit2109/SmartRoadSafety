"""
Signals for the `ai` app.

Cache invalidation rules (the source of all the bugs in this kind
of system if you forget them):

- `weight_file` change           -> invalidate
- `is_active` flipped to False   -> invalidate
- `is_default` flipped           -> invalidate (default swap may not
                                     affect the loaded model, but
                                     callers may want fresh metadata;
                                     also defensive)
- row deleted                    -> invalidate

Connected in `apps.py` via `AppConfig.ready()`.
"""
from __future__ import annotations

import logging

from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .cache import cache
from .models import AIModel

logger = logging.getLogger(__name__)


# Track the previous weight_file path on the instance so post_save
# can tell whether the file actually changed (a save with no real
# change shouldn't bounce the cache).
@receiver(pre_save, sender=AIModel)
def _stash_previous_state(sender, instance, **kwargs):
    if instance.pk:
        try:
            previous = AIModel.objects.only("weight_file", "is_active").get(pk=instance.pk)
            instance._previous_weight_file = previous.weight_file.name if previous.weight_file else None
            instance._previous_is_active = previous.is_active
        except AIModel.DoesNotExist:
            instance._previous_weight_file = None
            instance._previous_is_active = None
    else:
        instance._previous_weight_file = None
        instance._previous_is_active = None


@receiver(post_save, sender=AIModel)
def invalidate_cache_on_save(sender, instance, created, **kwargs):
    if created:
        # New rows are not in the cache yet, nothing to invalidate.
        # But if the row is created already inactive, don't pre-warm.
        return

    weight_changed = getattr(instance, "_previous_weight_file", None) != (
        instance.weight_file.name if instance.weight_file else None
    )
    activity_changed = getattr(instance, "_previous_is_active", None) != instance.is_active

    if weight_changed or activity_changed:
        cache.invalidate(instance.pk)
        logger.debug(
            "Cache invalidated for AIModel pk=%s (weight_changed=%s, activity_changed=%s)",
            instance.pk, weight_changed, activity_changed,
        )


@receiver(post_delete, sender=AIModel)
def invalidate_cache_on_delete(sender, instance, **kwargs):
    cache.invalidate(instance.pk)
    logger.debug("Cache invalidated for deleted AIModel pk=%s", instance.pk)
