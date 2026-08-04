"""Import / export API.

Import is a three-step flow so nothing is written before a human approves it:

    POST /api/dataio/imports/upload/    -> validate, store the file, return preview
    GET  /api/dataio/imports/{id}/preview/ -> re-read the preview
    POST /api/dataio/imports/{id}/commit/  -> write the rows (sync or via Celery)

Export mirrors it:

    GET /api/dataio/exports/preview/?kind=students -> first rows as JSON
    GET /api/dataio/exports/download/?kind=students -> the CSV
"""

import logging

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.csv_utils import decode_upload, read_rows, write_csv
from core.permissions import IsAuthenticatedAndActiveSchool, IsSchoolAdmin, IsStaffMember
from core.viewsets import TenantScopedMixin
from dataio.exporters import get_exporter
from dataio.importers import get_importer, template_columns
from dataio.models import ImportJob
from dataio.serializers import (
    ExportRequestSerializer,
    ImportJobSerializer,
    ImportUploadSerializer,
)
from dataio.tasks import process_import_job

logger = logging.getLogger(__name__)

#: Rows shown in the preview. Enough to spot a mis-mapped column without
#: shipping a 10,000-row payload to the browser.
PREVIEW_ROWS = 20

#: Above this, commit moves to Celery instead of blocking the request.
SYNC_COMMIT_LIMIT = 500


class ImportJobViewSet(TenantScopedMixin, viewsets.ReadOnlyModelViewSet):
    """Import history plus the upload/preview/commit actions."""

    queryset = ImportJob.objects.select_related('uploaded_by')
    serializer_class = ImportJobSerializer
    permission_classes = [IsAuthenticatedAndActiveSchool, IsSchoolAdmin]
    parser_classes = [MultiPartParser, FormParser]
    filterset_fields = ['kind', 'status']
    ordering_fields = ['created_at']

    @action(detail=False, methods=['post'])
    def upload(self, request):
        """Validate a CSV and return a preview. Nothing is written yet."""
        serializer = ImportUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        kind = serializer.validated_data['kind']
        upload = serializer.validated_data['file']
        school = request.user.school

        context = {}
        if serializer.validated_data.get('term'):
            context['term'] = serializer.validated_data['term']

        text = decode_upload(upload)

        try:
            importer = get_importer(kind, school=school, context=context,
                                    user=request.user)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        rows, _ = read_rows(text, importer.required_headers, importer.optional_headers)
        records, errors = importer.validate(rows)

        # Rewind so the FileField stores the whole file, not zero bytes.
        upload.seek(0)
        job = ImportJob.objects.create(
            school=school,
            kind=kind,
            file=upload,
            original_filename=upload.name[:255],
            status=ImportJob.Status.VALIDATED,
            total_rows=len(rows),
            valid_rows=len(records),
            errors=errors,
            error_count=len(errors),
            context=context,
            uploaded_by=request.user,
        )

        return Response(
            {
                'job': ImportJobSerializer(job).data,
                'columns': importer.preview_columns(),
                'preview': self._preview_rows(records),
                'errors': errors[:100],
                'summary': {
                    'total_rows': len(rows),
                    'valid_rows': len(records),
                    'error_rows': len(errors),
                },
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        """Re-validate the stored file and return a fresh preview."""
        job = self.get_object()

        job.file.open('rb')
        try:
            text = decode_upload(job.file)
        finally:
            job.file.close()

        importer = get_importer(
            job.kind, school=job.school, context=job.context, user=request.user
        )
        rows, _ = read_rows(text, importer.required_headers, importer.optional_headers)
        records, errors = importer.validate(rows)

        return Response(
            {
                'job': ImportJobSerializer(job).data,
                'columns': importer.preview_columns(),
                'preview': self._preview_rows(records),
                'errors': errors[:100],
                'summary': {
                    'total_rows': len(rows),
                    'valid_rows': len(records),
                    'error_rows': len(errors),
                },
            }
        )

    @action(detail=True, methods=['post'])
    def commit(self, request, pk=None):
        """Approve a validated import and write the valid rows."""
        job = self.get_object()

        if job.status == ImportJob.Status.COMPLETED:
            return Response(
                {'detail': 'This import has already been committed.'},
                status=status.HTTP_409_CONFLICT,
            )
        if job.status == ImportJob.Status.PROCESSING:
            return Response(
                {'detail': 'This import is already being processed.'},
                status=status.HTTP_409_CONFLICT,
            )

        # Big files go to a worker so the request does not time out.
        if job.valid_rows > SYNC_COMMIT_LIMIT:
            job.status = ImportJob.Status.PROCESSING
            job.save(update_fields=['status'])
            process_import_job.delay(job.id)
            return Response(
                {
                    'detail': (
                        f'{job.valid_rows} rows queued for background import. '
                        'Poll this job for progress.'
                    ),
                    'job': ImportJobSerializer(job).data,
                    'async': True,
                },
                status=status.HTTP_202_ACCEPTED,
            )

        job.file.open('rb')
        try:
            text = decode_upload(job.file)
        finally:
            job.file.close()

        importer = get_importer(
            job.kind, school=job.school, context=job.context, user=request.user
        )
        rows, _ = read_rows(text, importer.required_headers, importer.optional_headers)
        records, errors = importer.validate(rows)

        # Valid rows are committed even when some rows failed — a single bad row
        # should not block an otherwise good roster.
        result = importer.commit(records) if records else {'created': 0, 'updated': 0}

        job.total_rows = len(rows)
        job.valid_rows = len(records)
        job.created_count = result['created']
        job.updated_count = result['updated']
        job.errors = errors
        job.error_count = len(errors)
        job.status = ImportJob.Status.COMPLETED
        job.completed_at = timezone.now()
        job.save()

        return Response(
            {
                'job': ImportJobSerializer(job).data,
                'created': result['created'],
                'updated': result['updated'],
                'skipped': len(errors),
                'async': False,
            }
        )

    @action(detail=False, methods=['get'], url_path='template')
    def template(self, request):
        """GET /api/dataio/imports/template/?kind=students — a blank CSV template."""
        kind = request.query_params.get('kind')
        try:
            headers = template_columns(kind)
        except (ValueError, TypeError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        content = write_csv(headers, [])
        response = HttpResponse(content, content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="{kind}-import-template.csv"'
        )
        return response

    @staticmethod
    def _preview_rows(records):
        rows = []
        for record in records[:PREVIEW_ROWS]:
            rows.append(
                {
                    key: (str(value) if value is not None else '')
                    for key, value in record.items()
                    if not key.startswith('_') or key == '_line'
                }
            )
        return rows


class ExportPreviewView(APIView):
    """GET /api/dataio/exports/preview/?kind=students — rows as JSON."""

    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]

    def get(self, request):
        serializer = ExportRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            exporter = get_exporter(
                serializer.validated_data['kind'],
                school=request.user.school,
                filters=serializer.to_filters(),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                'kind': exporter.kind,
                'columns': list(exporter.headers),
                'total_rows': exporter.count(),
                'preview': exporter.rows(limit=PREVIEW_ROWS),
            }
        )


class ExportDownloadView(APIView):
    """GET /api/dataio/exports/download/?kind=students — the CSV file."""

    permission_classes = [IsAuthenticatedAndActiveSchool, IsStaffMember]

    def get(self, request):
        serializer = ExportRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            exporter = get_exporter(
                serializer.validated_data['kind'],
                school=request.user.school,
                filters=serializer.to_filters(),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        content = write_csv(list(exporter.headers), exporter.rows())
        response = HttpResponse(content, content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="{exporter.filename}"'
        )
        return response
