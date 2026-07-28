from django.utils.functional import SimpleLazyObject


def _resolve_school(request):
    """Return the School this request acts on, or None.

    None means either "not authenticated" or "platform superadmin", both of
    which must be treated as *no implicit tenant* by callers.
    """
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated:
        return None
    return user.school


class CurrentSchoolMiddleware:
    """Expose ``request.school`` for the authenticated user.

    Resolution is lazy because DRF authenticates inside the view, well after
    middleware runs — reading ``request.user`` eagerly here would always see
    AnonymousUser. Touching ``request.school`` from a view (by which point DRF
    has authenticated) resolves correctly.

    This is a convenience binding only. The security boundary lives in
    ``core.viewsets.TenantModelViewSet.get_queryset`` and the permission classes
    in ``core.permissions`` — never rely on this middleware alone for isolation.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.school = SimpleLazyObject(lambda: _resolve_school(request))
        return self.get_response(request)
