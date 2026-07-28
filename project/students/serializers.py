from django.db import transaction
from rest_framework import serializers

from accounts.models import Role, User
from students.models import (
    AcademicSession,
    AttendanceRecord,
    CheckoutRecord,
    Classroom,
    Student,
    Term,
)


class TenantValidatedSerializer(serializers.ModelSerializer):
    """Rejects FK values that point outside the caller's school.

    DRF's PrimaryKeyRelatedField queries the whole table by default, so without
    this a client could attach their record to another tenant's classroom simply
    by guessing an id. Subclasses list the FK field names in ``tenant_fields``.
    """

    tenant_fields = ()

    def _school(self):
        request = self.context.get('request')
        return getattr(request, 'user', None) and request.user.school_id

    def validate(self, attrs):
        attrs = super().validate(attrs)
        school_id = self._school()
        if school_id is None:
            return attrs

        for field in self.tenant_fields:
            value = attrs.get(field)
            if value is not None and getattr(value, 'school_id', None) != school_id:
                raise serializers.ValidationError(
                    {field: 'This record does not belong to your school.'}
                )
        return attrs


def demote_current(model, serializer, save_kwargs):
    """Clear the existing ``is_current`` row before another one claims the flag.

    ``AcademicSession`` and ``Term`` each carry a partial unique constraint
    allowing one current row per school. That constraint is evaluated during the
    write itself, so the previous holder must be demoted *first* — demoting
    afterwards never executes, because the write has already failed.

    The school is read from the save kwargs on create (the viewset stamps it
    there) and from the instance on update.
    """
    school_id = save_kwargs.get('school_id')
    if school_id is None and serializer.instance is not None:
        school_id = serializer.instance.school_id
    if school_id is None:
        request = serializer.context.get('request')
        school_id = getattr(getattr(request, 'user', None), 'school_id', None)
    if school_id is None:
        return

    queryset = model.objects.filter(school_id=school_id, is_current=True)
    if serializer.instance is not None:
        queryset = queryset.exclude(pk=serializer.instance.pk)
    queryset.update(is_current=False)


class AcademicSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicSession
        fields = ['id', 'name', 'start_date', 'end_date', 'is_current', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and start >= end:
            raise serializers.ValidationError(
                {'end_date': 'End date must fall after the start date.'}
            )
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        # Demote BEFORE saving. The `one_current_session_per_school` constraint
        # is checked during the INSERT/UPDATE itself, so demoting afterwards
        # would never run — the write fails first with an IntegrityError.
        if self.validated_data.get('is_current'):
            demote_current(AcademicSession, self, kwargs)
        return super().save(**kwargs)


class TermSerializer(TenantValidatedSerializer):
    tenant_fields = ('session',)
    session_name = serializers.CharField(source='session.name', read_only=True)

    class Meta:
        model = Term
        fields = [
            'id', 'session', 'session_name', 'name', 'start_date', 'end_date',
            'is_current', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and start >= end:
            raise serializers.ValidationError(
                {'end_date': 'End date must fall after the start date.'}
            )
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        # See AcademicSessionSerializer.save — demotion has to happen first.
        if self.validated_data.get('is_current'):
            demote_current(Term, self, kwargs)
        return super().save(**kwargs)


class ClassroomSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Classroom
        fields = [
            'id', 'name', 'arm', 'full_name', 'capacity', 'is_active',
            'student_count', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'student_count']


class StudentSerializer(TenantValidatedSerializer):
    tenant_fields = ('classroom',)

    full_name = serializers.CharField(read_only=True)
    classroom_name = serializers.CharField(source='classroom.full_name', read_only=True)

    class Meta:
        model = Student
        fields = [
            'id', 'admission_number', 'first_name', 'middle_name', 'last_name',
            'full_name', 'gender', 'date_of_birth', 'classroom', 'classroom_name',
            'parent_name', 'parent_phone', 'parent_email', 'address', 'photo',
            'status', 'enrolled_on', 'user', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'user']

    def validate_admission_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Admission number is required.')

        school_id = self._school()
        qs = Student.objects.filter(school_id=school_id, admission_number__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                'A student with this admission number already exists.'
            )
        return value


class StudentAccountSerializer(serializers.Serializer):
    """Provisions a login for an existing student record."""

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    @transaction.atomic
    def create(self, validated_data):
        student = self.context['student']
        if student.user_id:
            raise serializers.ValidationError(
                'This student already has a login account.'
            )

        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            first_name=student.first_name,
            last_name=student.last_name,
            role=Role.STUDENT,
            school_id=student.school_id,
        )
        student.user = user
        student.save(update_fields=['user'])
        return user


class AttendanceRecordSerializer(TenantValidatedSerializer):
    tenant_fields = ('student', 'session', 'term', 'classroom')

    student_name = serializers.CharField(source='student.full_name', read_only=True)
    admission_number = serializers.CharField(
        source='student.admission_number', read_only=True
    )

    class Meta:
        model = AttendanceRecord
        fields = [
            'id', 'student', 'student_name', 'admission_number', 'session', 'term',
            'classroom', 'date', 'status', 'remark', 'marked_by', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'marked_by']
        # See CheckoutRecordSerializer — we own the duplicate message so it
        # reads like something a human wrote.
        validators = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        term = attrs.get('term', getattr(self.instance, 'term', None))
        date = attrs.get('date', getattr(self.instance, 'date', None))
        student = attrs.get('student', getattr(self.instance, 'student', None))

        if student and date:
            clash = AttendanceRecord.objects.filter(student=student, date=date)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            existing = clash.first()
            if existing is not None:
                raise serializers.ValidationError(
                    {
                        'student': (
                            f'{student.full_name} is already marked '
                            f'"{existing.get_status_display()}" on {date}. '
                            'Edit that record instead of adding a second one.'
                        )
                    }
                )

        if date and date.weekday() >= 5:
            raise serializers.ValidationError(
                {'date': 'Attendance can only be marked on weekdays.'}
            )
        if term and date and not term.contains(date):
            raise serializers.ValidationError(
                {'date': f'{date} falls outside {term.name} '
                         f'({term.start_date} to {term.end_date}).'}
            )
        session = attrs.get('session', getattr(self.instance, 'session', None))
        if term and session and term.session_id != session.id:
            raise serializers.ValidationError(
                {'term': 'Term does not belong to the selected session.'}
            )
        return attrs


class AttendanceBulkMarkSerializer(serializers.Serializer):
    """Marks a whole class for one day in a single request.

    This is the shape the daily register UI actually uses — one call per class
    per day rather than one call per student.
    """

    date = serializers.DateField()
    term = serializers.PrimaryKeyRelatedField(queryset=Term.objects.all())
    classroom = serializers.PrimaryKeyRelatedField(
        queryset=Classroom.objects.all(), required=False, allow_null=True
    )
    entries = serializers.ListField(child=serializers.DictField(), allow_empty=False)

    def validate_date(self, value):
        if value.weekday() >= 5:
            raise serializers.ValidationError(
                'Attendance can only be marked on weekdays.'
            )
        return value

    def validate(self, attrs):
        request = self.context['request']
        school_id = request.user.school_id
        term = attrs['term']

        if term.school_id != school_id:
            raise serializers.ValidationError({'term': 'Unknown term.'})
        if attrs.get('classroom') and attrs['classroom'].school_id != school_id:
            raise serializers.ValidationError({'classroom': 'Unknown classroom.'})
        if not term.contains(attrs['date']):
            raise serializers.ValidationError(
                {'date': f'{attrs["date"]} falls outside {term.name}.'}
            )

        valid_statuses = set(AttendanceRecord.Status.values)
        student_ids = []
        cleaned = []
        for index, entry in enumerate(attrs['entries']):
            student_id = entry.get('student')
            status = entry.get('status', AttendanceRecord.Status.PRESENT)
            if student_id is None:
                raise serializers.ValidationError(
                    {'entries': f'Entry {index}: "student" is required.'}
                )
            if status not in valid_statuses:
                raise serializers.ValidationError(
                    {'entries': f'Entry {index}: invalid status "{status}".'}
                )
            student_ids.append(student_id)
            cleaned.append(
                {
                    'student_id': student_id,
                    'status': status,
                    'remark': (entry.get('remark') or '')[:255],
                }
            )

        if len(set(student_ids)) != len(student_ids):
            raise serializers.ValidationError(
                {'entries': 'The same student appears more than once.'}
            )

        # One query to prove every student belongs to this school.
        known = set(
            Student.objects.filter(school_id=school_id, id__in=student_ids)
            .values_list('id', flat=True)
        )
        unknown = set(student_ids) - known
        if unknown:
            raise serializers.ValidationError(
                {'entries': f'Unknown student id(s): {sorted(unknown)}.'}
            )

        attrs['cleaned_entries'] = cleaned
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        request = self.context['request']
        school_id = request.user.school_id
        term = self.validated_data['term']
        date = self.validated_data['date']
        classroom = self.validated_data.get('classroom')

        records = [
            AttendanceRecord(
                school_id=school_id,
                student_id=entry['student_id'],
                session_id=term.session_id,
                term=term,
                classroom=classroom,
                date=date,
                status=entry['status'],
                remark=entry['remark'],
                marked_by=request.user,
            )
            for entry in self.validated_data['cleaned_entries']
        ]

        # Re-marking a register is routine (a late student arrives), so upsert
        # on the (student, date) constraint instead of erroring.
        AttendanceRecord.objects.bulk_create(
            records,
            update_conflicts=True,
            update_fields=['status', 'remark', 'marked_by', 'classroom', 'updated_at'],
            unique_fields=['student', 'date'],
        )
        return records


class CheckoutRecordSerializer(TenantValidatedSerializer):
    tenant_fields = ('student', 'session', 'term', 'classroom')

    student_name = serializers.CharField(source='student.full_name', read_only=True)
    admission_number = serializers.CharField(
        source='student.admission_number', read_only=True
    )

    class Meta:
        model = CheckoutRecord
        fields = [
            'id', 'student', 'student_name', 'admission_number', 'session', 'term',
            'classroom', 'date', 'checked_out_at', 'released_to', 'relationship',
            'remark', 'recorded_by', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'recorded_by']
        # DRF's default message for this constraint reads "The fields student,
        # date must make a unique set", which means nothing to a school
        # secretary. Own the message instead.
        validators = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        term = attrs.get('term', getattr(self.instance, 'term', None))
        date = attrs.get('date', getattr(self.instance, 'date', None))
        student = attrs.get('student', getattr(self.instance, 'student', None))

        if term and date and not term.contains(date):
            raise serializers.ValidationError(
                {'date': f'{date} falls outside {term.name} '
                         f'({term.start_date} to {term.end_date}).'}
            )

        if student and date:
            clash = CheckoutRecord.objects.filter(student=student, date=date)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            existing = clash.first()
            if existing is not None:
                raise serializers.ValidationError(
                    {
                        'student': (
                            f'{student.full_name} was already checked out on {date} '
                            f'at {existing.checked_out_at:%H:%M}. Edit or delete that '
                            'record instead of adding a second one.'
                        )
                    }
                )
        return attrs
