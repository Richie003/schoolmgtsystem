from rest_framework import serializers

from dataio.exporters import EXPORTERS
from dataio.models import ImportJob


class ImportJobSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ImportJob
        fields = [
            'id', 'kind', 'original_filename', 'status', 'total_rows', 'valid_rows',
            'created_count', 'updated_count', 'error_count', 'errors', 'context',
            'uploaded_by', 'uploaded_by_name', 'created_at', 'completed_at',
        ]
        read_only_fields = fields

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        return obj.uploaded_by.get_full_name().strip() or obj.uploaded_by.username


class ImportUploadSerializer(serializers.Serializer):
    """Step 1: upload + validate. Writes nothing to the domain tables."""

    file = serializers.FileField()
    kind = serializers.ChoiceField(choices=ImportJob.Kind.choices)
    # Attendance and checkout imports need a term; students/staff/questions don't.
    term = serializers.IntegerField(required=False, allow_null=True)

    def validate_file(self, value):
        name = (value.name or '').lower()
        if not name.endswith('.csv'):
            raise serializers.ValidationError('Only .csv files are accepted.')
        return value

    def validate(self, attrs):
        if attrs['kind'] in (ImportJob.Kind.ATTENDANCE, ImportJob.Kind.CHECKOUTS):
            if not attrs.get('term'):
                raise serializers.ValidationError(
                    {'term': 'A term is required for attendance and checkout imports.'}
                )
        return attrs


class ExportRequestSerializer(serializers.Serializer):
    # Export kinds are a superset of import kinds (some datasets are export-only,
    # e.g. CBT records and results), so validate against the exporter registry.
    kind = serializers.ChoiceField(choices=[(k, k) for k in EXPORTERS])
    classroom = serializers.IntegerField(required=False, allow_null=True)
    term = serializers.IntegerField(required=False, allow_null=True)
    session = serializers.IntegerField(required=False, allow_null=True)
    subject = serializers.IntegerField(required=False, allow_null=True)
    exam = serializers.IntegerField(required=False, allow_null=True)
    bank = serializers.IntegerField(required=False, allow_null=True)
    status = serializers.CharField(required=False, allow_blank=True)
    employment_status = serializers.CharField(required=False, allow_blank=True)
    date_from = serializers.DateField(required=False, allow_null=True)
    date_to = serializers.DateField(required=False, allow_null=True)

    def to_filters(self):
        return {
            key: value
            for key, value in self.validated_data.items()
            if key != 'kind' and value not in (None, '')
        }
