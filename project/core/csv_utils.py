"""Shared CSV parsing/validation helpers used by the dataio app."""

import csv
import io

from django.conf import settings
from rest_framework.exceptions import ValidationError


class CsvStructureError(ValidationError):
    """Raised when a file is unusable as a whole (bad headers, empty, too big)."""


def decode_upload(uploaded_file):
    """Return the decoded text of an uploaded CSV, with size/type guards."""
    if uploaded_file.size == 0:
        raise CsvStructureError({'file': 'The uploaded file is empty.'})

    if uploaded_file.size > settings.CSV_MAX_UPLOAD_BYTES:
        limit_mb = settings.CSV_MAX_UPLOAD_BYTES / (1024 * 1024)
        raise CsvStructureError(
            {'file': f'File exceeds the maximum upload size of {limit_mb:.0f} MB.'}
        )

    raw = uploaded_file.read()
    if isinstance(raw, str):
        return raw

    # Excel on Windows commonly emits UTF-8 with BOM or cp1252.
    for encoding in ('utf-8-sig', 'utf-8', 'cp1252'):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CsvStructureError(
        {'file': 'Unable to decode the file. Save it as UTF-8 CSV and retry.'}
    )


def normalise_header(name):
    return (name or '').strip().lower().replace(' ', '_').replace('-', '_')


def read_rows(text, required_headers, optional_headers=()):
    """Parse CSV text into normalised dict rows.

    Returns ``(rows, headers)``. Raises :class:`CsvStructureError` if required
    headers are missing or the row count exceeds ``CSV_MAX_ROWS``. Unknown
    columns are reported rather than silently dropped, since a typo'd header is
    almost always a mistake the uploader wants to know about.
    """
    reader = csv.reader(io.StringIO(text))

    try:
        raw_headers = next(reader)
    except StopIteration:
        raise CsvStructureError({'file': 'The file contains no header row.'})

    headers = [normalise_header(h) for h in raw_headers]

    missing = [h for h in required_headers if h not in headers]
    if missing:
        raise CsvStructureError(
            {
                'headers': (
                    f'Missing required column(s): {", ".join(missing)}. '
                    f'Expected: {", ".join(list(required_headers) + list(optional_headers))}.'
                )
            }
        )

    known = set(required_headers) | set(optional_headers)
    unknown = [h for h in headers if h and h not in known]
    if unknown:
        raise CsvStructureError(
            {'headers': f'Unrecognised column(s): {", ".join(unknown)}.'}
        )

    rows = []
    for index, values in enumerate(reader, start=2):  # line 1 is the header
        if not any((v or '').strip() for v in values):
            continue  # skip blank separator lines

        if len(rows) >= settings.CSV_MAX_ROWS:
            raise CsvStructureError(
                {
                    'file': (
                        f'File exceeds the maximum of {settings.CSV_MAX_ROWS} rows. '
                        'Split it into smaller batches.'
                    )
                }
            )

        row = {
            header: (values[i].strip() if i < len(values) else '')
            for i, header in enumerate(headers)
            if header
        }
        row['_line'] = index
        rows.append(row)

    if not rows:
        raise CsvStructureError({'file': 'The file contains a header but no data rows.'})

    return rows, headers


def write_csv(headers, rows):
    """Serialise rows (list of dicts) to CSV text using ``headers`` for order."""
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=headers, extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def parse_bool(value, field='value'):
    """Parse the many spellings of yes/no that show up in spreadsheets."""
    normalised = (value or '').strip().lower()
    if normalised in ('true', 'yes', 'y', '1', 'present'):
        return True
    if normalised in ('false', 'no', 'n', '0', 'absent'):
        return False
    raise ValueError(f'{field}: expected yes/no, got "{value}".')
