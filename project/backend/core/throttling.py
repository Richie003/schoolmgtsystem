import logging

from rest_framework.throttling import ScopedRateThrottle

logger = logging.getLogger(__name__)


class ResilientScopedRateThrottle(ScopedRateThrottle):
    """A scoped throttle that fails *open* when the cache backend is down.

    Rate limiting here is spam mitigation, not a correctness guarantee. The
    throttle counter lives in the cache (Redis in production); if that becomes
    unreachable, letting requests through unthrottled is far better than
    returning 500 from a public endpoint — most importantly the anonymous school
    signup form — during what is already an infrastructure incident.

    It also means local development without Redis simply runs unthrottled rather
    than erroring.
    """

    def allow_request(self, request, view):
        try:
            return super().allow_request(request, view)
        except Exception:
            logger.warning(
                'Throttle cache unavailable; allowing request through', exc_info=True
            )
            return True
