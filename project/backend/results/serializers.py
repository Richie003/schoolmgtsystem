from django.db import transaction
from rest_framework import serializers

from cbt.models import Subject
from results.models import (
    AssessmentComponent,
    ClassResultSheet,
    GradeBand,
    GradingScheme,
    ReportTemplateSettings,
    StudentReport,
    SubjectResult,
)


# ---------------------------------------------------------------------------
# Grading scheme (nested, admin-editable)
# ---------------------------------------------------------------------------

class ComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentComponent
        fields = ['id', 'name', 'max_score', 'order', 'is_exam']


class GradeBandSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeBand
        fields = ['id', 'min_score', 'max_score', 'grade', 'remark', 'order']


class GradingSchemeSerializer(serializers.ModelSerializer):
    components = ComponentSerializer(many=True)
    bands = GradeBandSerializer(many=True)
    total_max = serializers.IntegerField(read_only=True)

    class Meta:
        model = GradingScheme
        fields = ['id', 'name', 'is_default', 'is_active', 'total_max',
                  'components', 'bands']
        read_only_fields = ['id', 'total_max']

    def validate_components(self, value):
        if not value:
            raise serializers.ValidationError('Add at least one component.')
        if not any(c.get('is_exam') for c in value):
            raise serializers.ValidationError('Mark one component as the exam component.')
        return value

    def _write_nested(self, scheme, components, bands):
        school = scheme.school
        scheme.components.all().delete()
        AssessmentComponent.objects.bulk_create([
            AssessmentComponent(school=school, scheme=scheme, order=i, **c)
            for i, c in enumerate(components)
        ])
        scheme.bands.all().delete()
        GradeBand.objects.bulk_create([
            GradeBand(school=school, scheme=scheme, order=i, **b)
            for i, b in enumerate(bands)
        ])

    @transaction.atomic
    def create(self, validated_data):
        components = validated_data.pop('components')
        bands = validated_data.pop('bands')
        scheme = GradingScheme.objects.create(**validated_data)
        self._write_nested(scheme, components, bands)
        return scheme

    @transaction.atomic
    def update(self, instance, validated_data):
        components = validated_data.pop('components', None)
        bands = validated_data.pop('bands', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if components is not None and bands is not None:
            self._write_nested(instance, components, bands)
        return instance


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------

class ClassResultSheetSerializer(serializers.ModelSerializer):
    classroom_name = serializers.CharField(source='classroom.full_name', read_only=True)
    term_name = serializers.CharField(source='term.name', read_only=True)
    session_name = serializers.CharField(source='session.name', read_only=True)
    scheme_name = serializers.CharField(source='scheme.name', read_only=True)
    subject_names = serializers.SerializerMethodField()
    report_count = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = ClassResultSheet
        fields = [
            'id', 'classroom', 'classroom_name', 'session', 'session_name',
            'term', 'term_name', 'scheme', 'scheme_name', 'subjects',
            'subject_names', 'status', 'next_term_begins', 'report_count',
            'student_count', 'submitted_at', 'cumulated_at', 'reviewed_at',
            'published_at', 'created_at',
        ]
        read_only_fields = [
            'id', 'session', 'status', 'submitted_at', 'cumulated_at',
            'reviewed_at', 'published_at', 'created_at',
        ]
        extra_kwargs = {'scheme': {'required': False}}

    def get_subject_names(self, obj):
        return [s.name for s in obj.subjects.all()]

    def get_report_count(self, obj):
        return obj.reports.count()

    def get_student_count(self, obj):
        return obj.classroom.students.filter(status='active').count()

    def validate(self, attrs):
        # session is derived from the term; keep them consistent.
        term = attrs.get('term') or getattr(self.instance, 'term', None)
        if term is not None:
            attrs['session'] = term.session
        subjects = attrs.get('subjects')
        if subjects is not None and len(subjects) == 0:
            raise serializers.ValidationError({'subjects': 'Choose at least one subject.'})
        return attrs


class ScoreRowSerializer(serializers.Serializer):
    """One cell-group in the entry grid: a student's scores for a subject."""

    student = serializers.IntegerField()
    subject = serializers.IntegerField()
    scores = serializers.DictField(child=serializers.FloatField(), required=False)
    teacher_remark = serializers.CharField(
        required=False, allow_blank=True, max_length=255
    )


class BulkScoreSerializer(serializers.Serializer):
    rows = ScoreRowSerializer(many=True, allow_empty=False)


# ---------------------------------------------------------------------------
# Report card (rich read) + remarks
# ---------------------------------------------------------------------------

class ReportRemarkSerializer(serializers.ModelSerializer):
    """Class-teacher review edits: remarks and (premium) trait ratings."""

    class Meta:
        model = StudentReport
        fields = ['class_teacher_remark', 'principal_remark', 'traits']


class ReportListSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    admission_number = serializers.CharField(
        source='student.admission_number', read_only=True
    )

    class Meta:
        model = StudentReport
        fields = [
            'id', 'student', 'student_name', 'admission_number', 'subjects_count',
            'total', 'average', 'grade', 'position', 'class_size',
            'class_teacher_remark', 'published_at',
        ]


class ReportTemplateSettingsSerializer(serializers.ModelSerializer):
    is_premium = serializers.BooleanField(source='school.is_premium', read_only=True)

    class Meta:
        model = ReportTemplateSettings
        fields = [
            'header_text', 'show_attendance', 'show_positions', 'show_remarks',
            'show_traits', 'traits', 'is_premium',
        ]
