from django.db import transaction
from rest_framework import serializers

from cbt.models import (
    Choice,
    Exam,
    ExamAttempt,
    Question,
    QuestionBank,
    StudentAnswer,
    Subject,
)
from students.serializers import TenantValidatedSerializer


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'name', 'code', 'description', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class QuestionBankSerializer(TenantValidatedSerializer):
    tenant_fields = ('subject',)

    subject_name = serializers.CharField(source='subject.name', read_only=True)
    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = QuestionBank
        fields = [
            'id', 'subject', 'subject_name', 'name', 'description', 'is_active',
            'question_count', 'created_by', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'question_count']


class ChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Choice
        fields = ['id', 'text', 'is_correct', 'order']


class ChoicePublicSerializer(serializers.ModelSerializer):
    """Choice as shown to a student mid-exam — ``is_correct`` is never sent."""

    class Meta:
        model = Choice
        fields = ['id', 'text']


class QuestionSerializer(TenantValidatedSerializer):
    """Full question including answer keys. Staff-only."""

    tenant_fields = ('bank',)
    choices = ChoiceSerializer(many=True)
    correct_count = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            'id', 'bank', 'question_type', 'text', 'image', 'marks', 'difficulty',
            'explanation', 'is_active', 'choices', 'correct_count',
            'created_by', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'created_by', 'correct_count']

    def get_correct_count(self, obj):
        return sum(1 for choice in obj.choices.all() if choice.is_correct)

    def validate(self, attrs):
        attrs = super().validate(attrs)

        choices = attrs.get('choices')
        question_type = attrs.get(
            'question_type', getattr(self.instance, 'question_type', Question.Kind.SINGLE)
        )

        # On a partial update that doesn't touch choices, validate the existing
        # ones against the (possibly new) question type.
        if choices is None:
            if self.instance is None:
                raise serializers.ValidationError(
                    {'choices': 'Provide the answer options for this question.'}
                )
            existing = list(self.instance.choices.values('text', 'is_correct'))
            choices = existing

        if len(choices) < 2:
            raise serializers.ValidationError(
                {'choices': 'A question needs at least two options.'}
            )

        blank = [c for c in choices if not str(c.get('text', '')).strip()]
        if blank:
            raise serializers.ValidationError(
                {'choices': 'Options cannot be blank.'}
            )

        correct = [c for c in choices if c.get('is_correct')]

        if question_type == Question.Kind.MULTIPLE:
            if len(correct) < 1:
                raise serializers.ValidationError(
                    {'choices': 'Mark at least one option correct.'}
                )
            if len(correct) == len(choices):
                # Every option correct means everyone scores; almost always a
                # mistake rather than an intent.
                raise serializers.ValidationError(
                    {'choices': 'At least one option must be incorrect.'}
                )
        elif len(correct) != 1:
            raise serializers.ValidationError(
                {
                    'choices': (
                        'A single-answer question needs exactly one correct option. '
                        'Switch it to "multiple answers" to mark several.'
                    )
                }
            )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        choices = validated_data.pop('choices')
        question = Question.objects.create(**validated_data)
        Choice.objects.bulk_create(
            Choice(
                question=question,
                text=c['text'],
                is_correct=c.get('is_correct', False),
                order=c.get('order', index),
            )
            for index, c in enumerate(choices)
        )
        return question

    @transaction.atomic
    def update(self, instance, validated_data):
        choices = validated_data.pop('choices', None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if choices is not None:
            # Replace wholesale: partial choice diffing would risk leaving an
            # orphaned correct answer behind.
            instance.choices.all().delete()
            Choice.objects.bulk_create(
                Choice(
                    question=instance,
                    text=c['text'],
                    is_correct=c.get('is_correct', False),
                    order=c.get('order', index),
                )
                for index, c in enumerate(choices)
            )
        return instance


class QuestionImageSerializer(serializers.Serializer):
    """Validates an uploaded question image. Kept separate so the image travels
    as multipart, away from the nested-choices JSON of the main serializer."""

    image = serializers.ImageField()

    def validate_image(self, value):
        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError('Image must be smaller than 2 MB.')
        return value


class ExamSerializer(TenantValidatedSerializer):
    tenant_fields = ('subject', 'bank', 'session', 'term')

    subject_name = serializers.CharField(source='subject.name', read_only=True)
    bank_name = serializers.CharField(source='bank.name', read_only=True)
    term_name = serializers.CharField(source='term.name', read_only=True)
    available_question_count = serializers.IntegerField(read_only=True)
    attempt_count = serializers.IntegerField(read_only=True)
    is_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = Exam
        fields = [
            'id', 'title', 'subject', 'subject_name', 'bank', 'bank_name',
            'session', 'term', 'term_name', 'classrooms', 'instructions',
            'question_count', 'duration_minutes', 'pass_mark_percent',
            'starts_at', 'ends_at', 'shuffle_questions', 'shuffle_choices',
            'max_attempts', 'show_results_immediately', 'status',
            'available_question_count', 'attempt_count', 'is_open',
            'created_by', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'created_by']

    def validate(self, attrs):
        attrs = super().validate(attrs)

        starts = attrs.get('starts_at', getattr(self.instance, 'starts_at', None))
        ends = attrs.get('ends_at', getattr(self.instance, 'ends_at', None))
        if starts and ends and starts >= ends:
            raise serializers.ValidationError(
                {'ends_at': 'End time must fall after the start time.'}
            )

        bank = attrs.get('bank', getattr(self.instance, 'bank', None))
        subject = attrs.get('subject', getattr(self.instance, 'subject', None))
        if bank and subject and bank.subject_id != subject.id:
            raise serializers.ValidationError(
                {'bank': 'Question bank does not belong to the selected subject.'}
            )

        count = attrs.get(
            'question_count', getattr(self.instance, 'question_count', None)
        )
        if bank and count:
            available = bank.questions.filter(is_active=True).count()
            if available < count:
                raise serializers.ValidationError(
                    {
                        'question_count': (
                            f'The bank holds only {available} active question(s); '
                            f'cannot draw {count}.'
                        )
                    }
                )

        classrooms = attrs.get('classrooms')
        if classrooms:
            school_id = self._school()
            stray = [c.id for c in classrooms if c.school_id != school_id]
            if stray:
                raise serializers.ValidationError(
                    {'classrooms': 'One or more classes belong to a different school.'}
                )
        return attrs


class ExamStudentSerializer(serializers.ModelSerializer):
    """What a student sees when browsing available exams — no answer material."""

    subject_name = serializers.CharField(source='subject.name', read_only=True)
    is_open = serializers.BooleanField(read_only=True)
    attempts_used = serializers.IntegerField(read_only=True)

    class Meta:
        model = Exam
        fields = [
            'id', 'title', 'subject_name', 'instructions', 'question_count',
            'duration_minutes', 'pass_mark_percent', 'starts_at', 'ends_at',
            'max_attempts', 'attempts_used', 'is_open', 'status',
        ]


class AttemptQuestionSerializer(serializers.Serializer):
    """A question as delivered to the student, in their personal order."""

    id = serializers.IntegerField()
    text = serializers.CharField()
    image = serializers.SerializerMethodField()
    marks = serializers.IntegerField()
    question_type = serializers.CharField()
    correct_count = serializers.SerializerMethodField()
    choices = serializers.SerializerMethodField()
    selected_choices = serializers.SerializerMethodField()

    def get_image(self, obj):
        return obj.image.url if obj.image else None

    def get_correct_count(self, obj):
        """How many options to pick — shown for multi-answer questions only.

        Revealing this on a single-answer question would say nothing, and for
        multi-answer it's standard exam practice ("choose two") rather than a
        leak: it doesn't identify *which* options are correct.
        """
        if obj.question_type != Question.Kind.MULTIPLE:
            return None
        return sum(1 for choice in obj.choices.all() if choice.is_correct)

    def get_choices(self, obj):
        ordering = self.context.get('choice_order', {}).get(str(obj.id))
        choices = list(obj.choices.all())
        if ordering:
            position = {cid: i for i, cid in enumerate(ordering)}
            choices.sort(key=lambda c: position.get(c.id, 999))
        return ChoicePublicSerializer(choices, many=True).data

    def get_selected_choices(self, obj):
        return self.context.get('answers', {}).get(obj.id, [])


class ExamAttemptSerializer(serializers.ModelSerializer):
    """Attempt state. Scores are hidden until the attempt is closed."""

    exam_title = serializers.CharField(source='exam.title', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    seconds_remaining = serializers.IntegerField(read_only=True)
    score = serializers.SerializerMethodField()
    percentage = serializers.SerializerMethodField()
    is_passed = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            'id', 'exam', 'exam_title', 'student', 'student_name', 'attempt_number',
            'status', 'started_at', 'expires_at', 'submitted_at', 'seconds_remaining',
            'score', 'total_marks', 'percentage', 'is_passed',
        ]
        read_only_fields = fields

    def _is_finished(self, obj):
        return obj.status in (
            ExamAttempt.Status.SUBMITTED, ExamAttempt.Status.AUTO_SUBMITTED
        )

    def get_score(self, obj):
        return float(obj.score) if self._is_finished(obj) else None

    def get_percentage(self, obj):
        return float(obj.percentage) if self._is_finished(obj) else None

    def get_is_passed(self, obj):
        return obj.is_passed if self._is_finished(obj) else None


class SaveAnswerSerializer(serializers.Serializer):
    """Accepts either a single ``choice`` or a list of ``choices``.

    Both spellings are supported so a single-answer client stays simple while
    multi-answer questions can post a set.
    """

    question = serializers.IntegerField()
    choice = serializers.IntegerField(required=False, allow_null=True)
    choices = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )

    def validate(self, attrs):
        if 'choices' in attrs:
            attrs['selection'] = attrs['choices']
        elif attrs.get('choice') is not None:
            attrs['selection'] = [attrs['choice']]
        else:
            # An explicit null clears the answer.
            attrs['selection'] = []
        return attrs


class BulkSaveAnswersSerializer(serializers.Serializer):
    """Batched auto-save, so a flaky connection can flush several answers at once."""

    answers = serializers.ListField(child=SaveAnswerSerializer(), allow_empty=False)


class AttemptResultSerializer(serializers.ModelSerializer):
    """Post-submission review, including per-question correctness."""

    exam_title = serializers.CharField(source='exam.title', read_only=True)
    breakdown = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            'id', 'exam', 'exam_title', 'attempt_number', 'status', 'score',
            'total_marks', 'percentage', 'is_passed', 'submitted_at', 'breakdown',
        ]

    def get_breakdown(self, obj):
        if not obj.exam.show_results_immediately and not self.context.get('is_staff'):
            return None

        answers = {
            a.question_id: a
            for a in StudentAnswer.objects.filter(attempt=obj)
            .select_related('question')
            .prefetch_related('selected_choices', 'question__choices')
        }
        rows = []
        for question_id in obj.question_order:
            answer = answers.get(question_id)
            if answer is None:
                rows.append(
                    {
                        'question_id': question_id,
                        'question': None,
                        'selected': None,
                        'correct_answer': None,
                        'is_correct': False,
                        'marks_awarded': 0.0,
                        'explanation': '',
                    }
                )
                continue

            correct = [c.text for c in answer.question.choices.all() if c.is_correct]
            rows.append(
                {
                    'question_id': question_id,
                    'question': answer.question.text,
                    'question_type': answer.question.question_type,
                    'selected': answer.selected_text() or None,
                    'correct_answer': ', '.join(correct),
                    'is_correct': answer.is_correct,
                    'marks_awarded': float(answer.marks_awarded),
                    'explanation': answer.question.explanation,
                }
            )
        return rows
