import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Normalise non-DRF exceptions into JSON API errors.

    Model-level ``full_clean`` failures and DB integrity errors would otherwise
    surface as opaque 500s, which is a poor experience for the CSV import flows
    where constraint violations are routine and expected.
    """
    if isinstance(exc, DjangoValidationError):
        detail = exc.message_dict if hasattr(exc, 'message_dict') else exc.messages
        return Response({'detail': detail}, status=status.HTTP_400_BAD_REQUEST)

    if isinstance(exc, IntegrityError):
        logger.warning('IntegrityError in %s: %s', context.get('view'), exc)
        return Response(
            {'detail': 'This operation conflicts with existing data.'},
            status=status.HTTP_409_CONFLICT,
        )

    return drf_exception_handler(exc, context)
