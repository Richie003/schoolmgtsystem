"""Formula source must survive storage, the API and the CSV round trip.

Rendering happens in the SPA, but that only works if the backend hands back
exactly what the author typed. Backslashes, commas, quotes and newlines are all
ordinary characters in LaTeX and all have special meaning to CSV, so this is the
layer where silent corruption would happen.
"""

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Role, User
from cbt.models import Choice, Question, QuestionBank, Subject
from core.csv_utils import read_rows, write_csv
from core.models import School
from dataio.exporters import get_exporter
from dataio.importers import get_importer

#: Notation a maths or physics teacher would realistically type.
FORMULAS = [
    ('inline', r'What is $E = mc^2$ used for?'),
    ('fraction', r'Evaluate $\frac{-b \pm \sqrt{b^2-4ac}}{2a}$'),
    ('display', r'Show that $$\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$$'),
    ('units', r'A mass $m = 5\,\mathrm{kg}$ accelerates at $2\,\mathrm{m/s^2}$'),
    ('subscripts', r'Given $v_f^2 = v_i^2 + 2as$, find $v_f$'),
    ('comma in math', r'Solve $f(x,y) = x^2 + y^2$'),
    ('vectors', r'Find $\vec{F} = m\vec{a}$ when $\theta = 30^\circ$'),
    ('chemistry', r'Balance $\mathrm{H_2SO_4} + \mathrm{NaOH}$'),
    ('quotes', r'The "escape velocity" is $v_e = \sqrt{\frac{2GM}{R}}$'),
    ('unicode', 'Simplify x² + 2x + 1 where θ = 45°'),
    ('matrix', r'$\left[\begin{matrix} a & b \\ c & d \end{matrix}\right]$'),
    ('escaped dollar', r'It costs \$5 to compute $x^2$'),
    ('bracket delimiters', r'Given \[F = ma\] and \(v = u + at\)'),
]


class FormulaFixtureMixin:
    def setUp(self):
        super().setUp()
        self.school = School.objects.create(name='Test School', code='TST')
        self.admin = User.objects.create_user(
            username='admin', password='Sup3rSecret!23',
            role=Role.SCHOOL_ADMIN, school=self.school,
        )
        self.subject = Subject.objects.create(school=self.school, name='Physics')
        self.bank = QuestionBank.objects.create(
            school=self.school, subject=self.subject, name='Mechanics'
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client


class FormulaApiTests(FormulaFixtureMixin, TestCase):
    def test_formula_source_round_trips_through_the_api(self):
        client = self.client_for(self.admin)

        for label, source in FORMULAS:
            with self.subTest(label):
                response = client.post(
                    '/api/cbt/questions/',
                    {
                        'bank': self.bank.id,
                        'text': source,
                        'marks': 1,
                        'choices': [
                            {'text': source, 'is_correct': True},
                            {'text': 'Plain option', 'is_correct': False},
                        ],
                    },
                    format='json',
                )
                self.assertEqual(response.status_code, 201, response.data)

                read_back = client.get(f'/api/cbt/questions/{response.data["id"]}/')
                self.assertEqual(read_back.data['text'], source)
                self.assertEqual(read_back.data['choices'][0]['text'], source)

    def test_newlines_inside_a_question_are_preserved(self):
        source = 'Given:\n$$a^2 + b^2 = c^2$$\nFind $c$.'
        client = self.client_for(self.admin)

        response = client.post(
            '/api/cbt/questions/',
            {
                'bank': self.bank.id, 'text': source, 'marks': 1,
                'choices': [
                    {'text': 'A', 'is_correct': True},
                    {'text': 'B', 'is_correct': False},
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            client.get(f'/api/cbt/questions/{response.data["id"]}/').data['text'],
            source,
        )

    def test_formula_in_explanation_is_preserved(self):
        source = r'Because $F = ma$, we get $F = 10\,\mathrm{N}$'
        client = self.client_for(self.admin)

        response = client.post(
            '/api/cbt/questions/',
            {
                'bank': self.bank.id, 'text': 'Q?', 'explanation': source, 'marks': 1,
                'choices': [
                    {'text': 'A', 'is_correct': True},
                    {'text': 'B', 'is_correct': False},
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['explanation'], source)

    def test_student_receives_formula_source_verbatim(self):
        """The paper must carry the source so the SPA can typeset it."""
        source = r'Find $\frac{1}{2}mv^2$'
        Question.objects.create(
            school=self.school, bank=self.bank, text=source, marks=2,
        )
        question = Question.objects.get(text=source)
        Choice.objects.create(question=question, text=r'$\frac{1}{2}mv^2$',
                              is_correct=True, order=0)
        Choice.objects.create(question=question, text='mgh', is_correct=False, order=1)

        response = self.client_for(self.admin).get(
            f'/api/cbt/questions/{question.id}/'
        )
        self.assertEqual(response.data['text'], source)


class FormulaCsvTests(FormulaFixtureMixin, TestCase):
    def test_formulas_survive_export_then_reimport(self):
        for index, (_, source) in enumerate(FORMULAS):
            question = Question.objects.create(
                school=self.school, bank=self.bank, text=source, marks=1,
            )
            Choice.objects.create(question=question, text=f'{source} A',
                                  is_correct=True, order=0)
            Choice.objects.create(question=question, text=f'opt {index}',
                                  is_correct=False, order=1)

        exporter = get_exporter('questions', school=self.school)
        rows = exporter.rows()
        self.assertEqual(len(rows), len(FORMULAS))

        importer = get_importer('questions', school=self.school)
        csv_text = write_csv(list(exporter.headers), rows)
        parsed, _ = read_rows(
            csv_text, importer.required_headers, importer.optional_headers
        )

        exported_texts = {row['text'] for row in parsed}
        for label, source in FORMULAS:
            with self.subTest(label):
                self.assertIn(source, exported_texts)

        records, errors = importer.validate(parsed)
        self.assertEqual(errors, [])
        self.assertEqual(len(records), len(FORMULAS))

    def test_backslashes_are_not_stripped_by_the_cell_reader(self):
        """`text()` trims whitespace — it must not touch anything else."""
        from dataio.importers import text

        source = r'$\frac{\sqrt{2}}{2}\,\mathrm{m/s}$'
        self.assertEqual(text({'value': f'  {source}  '}, 'value'), source)
        self.assertEqual(text({'value': source}, 'value'), source)

    def test_imported_formula_reaches_the_database_intact(self):
        csv_text = (
            'bank,text,option_a,option_b,correct_option\n'
            '"Mechanics","Find $\\frac{1}{2}mv^2$","$\\frac{1}{2}mv^2$","$mgh$","a"\n'
        )
        importer = get_importer('questions', school=self.school)
        rows, _ = read_rows(
            csv_text, importer.required_headers, importer.optional_headers
        )
        records, errors = importer.validate(rows)

        self.assertEqual(errors, [])
        importer.commit(records)

        question = Question.objects.get(bank=self.bank)
        self.assertEqual(question.text, r'Find $\frac{1}{2}mv^2$')
        self.assertEqual(
            question.choices.get(is_correct=True).text, r'$\frac{1}{2}mv^2$',
        )
