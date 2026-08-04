from django.db import transaction
from rest_framework import serializers

from cbt.models import Choice, Question, QuestionBank, Subject
from cbtgen import constants
from cbtgen.models import AIGenerationSettings, QuestionGenerationJob


# ---------------------------------------------------------------------------
# Settings / availability (admin-facing + status for staff)
# ---------------------------------------------------------------------------

class DisabledStaffSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.SerializerMethodField()

    def get_name(self, user):
        return user.get_full_name().strip() or user.username


class AIGenerationSettingsSerializer(serializers.ModelSerializer):
    remaining_trials = serializers.IntegerField(read_only=True)
    plan = serializers.CharField(source='school.plan', read_only=True)
    is_premium = serializers.BooleanField(source='school.is_premium', read_only=True)
    disabled_staff_detail = DisabledStaffSerializer(
        source='disabled_staff', many=True, read_only=True
    )

    class Meta:
        model = AIGenerationSettings
        fields = [
            'is_enabled', 'trial_limit', 'trials_used', 'remaining_trials',
            'plan', 'is_premium', 'disabled_staff', 'disabled_staff_detail',
        ]
        read_only_fields = ['trials_used']

    def validate_disabled_staff(self, users):
        # Only staff within this school may be listed.
        school = self.instance.school
        for user in users:
            if user.school_id != school.id:
                raise serializers.ValidationError('Staff must belong to your school.')
        return users


# ---------------------------------------------------------------------------
# Create a generation job
# ---------------------------------------------------------------------------

class CreateGenerationJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionGenerationJob
        fields = [
            'id', 'class_level', 'exam_standard', 'subject_name', 'topics',
            'complexity', 'calculation_ratio', 'question_count', 'question_type',
        ]
        read_only_fields = ['id']

    def validate_class_level(self, value):
        if value not in constants.CLASS_LEVEL_VALUES:
            raise serializers.ValidationError('Choose a valid class level.')
        return value

    def validate_exam_standard(self, value):
        if value not in constants.EXAM_STANDARD_VALUES:
            raise serializers.ValidationError('Choose a valid examination standard.')
        return value

    def validate_complexity(self, value):
        if value not in constants.COMPLEXITY_VALUES:
            raise serializers.ValidationError('Choose a valid complexity.')
        return value

    def validate_subject_name(self, value):
        value = (value or '').strip()
        if len(value) < 2:
            raise serializers.ValidationError('Enter the subject.')
        return value

    def validate_calculation_ratio(self, value):
        if not 0 <= value <= 100:
            raise serializers.ValidationError('Ratio must be between 0 and 100.')
        return value

    def validate_question_count(self, value):
        cap = 40
        if not 1 <= value <= cap:
            raise serializers.ValidationError(f'Choose between 1 and {cap} questions.')
        return value


# ---------------------------------------------------------------------------
# Read a job (status + generated questions)
# ---------------------------------------------------------------------------

class GenerationJobSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = QuestionGenerationJob
        fields = [
            'id', 'status', 'class_level', 'exam_standard', 'subject_name', 'topics',
            'complexity', 'calculation_ratio', 'question_count', 'question_type',
            'generated', 'error', 'model_used', 'committed_bank', 'committed_count',
            'created_by', 'created_by_name', 'created_at',
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name().strip() or obj.created_by.username


# ---------------------------------------------------------------------------
# Commit reviewed questions into a bank
# ---------------------------------------------------------------------------

class CommitChoiceSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=500)
    is_correct = serializers.BooleanField(default=False)


class CommitQuestionSerializer(serializers.Serializer):
    text = serializers.CharField()
    difficulty = serializers.ChoiceField(choices=['easy', 'medium', 'hard'], default='medium')
    explanation = serializers.CharField(allow_blank=True, default='')
    options = CommitChoiceSerializer(many=True)

    def validate_options(self, options):
        if not 2 <= len(options) <= 8:
            raise serializers.ValidationError('A question needs between 2 and 8 options.')
        if not any(o['is_correct'] for o in options):
            raise serializers.ValidationError('Mark at least one correct option.')
        return options


class CommitSerializer(serializers.Serializer):
    """Save the teacher-approved questions into a subject's bank.

    The subject/bank may be an existing one (by id) or created by name.
    """

    subject_id = serializers.IntegerField(required=False)
    subject_name = serializers.CharField(required=False, allow_blank=True)
    bank_id = serializers.IntegerField(required=False)
    bank_name = serializers.CharField(required=False, allow_blank=True)
    questions = CommitQuestionSerializer(many=True)

    def validate_questions(self, questions):
        if not questions:
            raise serializers.ValidationError('Select at least one question to save.')
        return questions

    def _resolve_subject(self, school, data):
        if data.get('subject_id'):
            try:
                return Subject.objects.get(pk=data['subject_id'], school=school)
            except Subject.DoesNotExist:
                raise serializers.ValidationError({'subject_id': 'Unknown subject.'})
        name = (data.get('subject_name') or self.context['job'].subject_name).strip()
        if not name:
            raise serializers.ValidationError({'subject_name': 'A subject is required.'})
        subject, _ = Subject.objects.get_or_create(school=school, name=name)
        return subject

    def _resolve_bank(self, school, subject, data, user):
        if data.get('bank_id'):
            try:
                bank = QuestionBank.objects.get(pk=data['bank_id'], school=school)
            except QuestionBank.DoesNotExist:
                raise serializers.ValidationError({'bank_id': 'Unknown question bank.'})
            if bank.subject_id != subject.id:
                raise serializers.ValidationError(
                    {'bank_id': 'That bank belongs to a different subject.'}
                )
            return bank
        name = (data.get('bank_name') or '').strip()
        if not name:
            raise serializers.ValidationError(
                {'bank_name': 'Choose an existing bank or name a new one.'}
            )
        bank, _ = QuestionBank.objects.get_or_create(
            school=school, subject=subject, name=name,
            defaults={'created_by': user},
        )
        return bank

    @transaction.atomic
    def save(self, **kwargs):
        job = self.context['job']
        user = self.context['request'].user
        school = job.school
        data = self.validated_data

        subject = self._resolve_subject(school, data)
        bank = self._resolve_bank(school, subject, data, user)
        qtype = job.question_type

        created = 0
        for item in data['questions']:
            options = item['options']
            # Enforce the single-answer invariant defensively.
            if qtype == 'single':
                correct_seen = False
                for opt in options:
                    if opt['is_correct'] and not correct_seen:
                        correct_seen = True
                    else:
                        opt['is_correct'] = False
                if not correct_seen:
                    options[0]['is_correct'] = True

            question = Question.objects.create(
                school=school,
                bank=bank,
                question_type=qtype,
                text=item['text'],
                difficulty=item['difficulty'],
                explanation=item.get('explanation', ''),
                created_by=user,
            )
            Choice.objects.bulk_create([
                Choice(question=question, text=opt['text'],
                       is_correct=opt['is_correct'], order=idx)
                for idx, opt in enumerate(options)
            ])
            created += 1

        job.status = QuestionGenerationJob.Status.COMMITTED
        job.committed_bank = bank
        job.committed_count = created
        job.save(update_fields=['status', 'committed_bank', 'committed_count', 'updated_at'])

        self._result = {
            'created': created,
            'bank': {'id': bank.id, 'name': bank.name, 'subject': subject.name},
        }
        return self._result

    @property
    def result(self):
        return self._result
