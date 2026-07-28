"""Add multi-answer questions and move selections to a set.

Operation order matters here. ``makemigrations`` puts ``RemoveField`` first,
which would drop every existing selection before it could be copied across. The
add → copy → remove order below preserves answers already recorded against
submitted attempts.
"""

from django.db import migrations, models


def copy_selection_to_m2m(apps, schema_editor):
    StudentAnswer = apps.get_model('cbt', 'StudentAnswer')

    for answer in StudentAnswer.objects.filter(
        selected_choice__isnull=False
    ).iterator():
        answer.selected_choices.add(answer.selected_choice_id)


def copy_m2m_to_selection(apps, schema_editor):
    """Reverse: keep the first selection, which is all a single FK can hold."""
    StudentAnswer = apps.get_model('cbt', 'StudentAnswer')

    for answer in StudentAnswer.objects.prefetch_related('selected_choices').iterator():
        first = answer.selected_choices.first()
        if first is not None:
            answer.selected_choice_id = first.id
            answer.save(update_fields=['selected_choice'])


class Migration(migrations.Migration):

    dependencies = [
        ('cbt', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='question',
            name='question_type',
            field=models.CharField(
                choices=[('single', 'Single answer'), ('multiple', 'Multiple answers')],
                db_index=True,
                default='single',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='studentanswer',
            name='selected_choices',
            field=models.ManyToManyField(
                blank=True, related_name='student_answers', to='cbt.choice'
            ),
        ),
        migrations.RunPython(copy_selection_to_m2m, copy_m2m_to_selection),
        migrations.RemoveField(
            model_name='studentanswer',
            name='selected_choice',
        ),
    ]
