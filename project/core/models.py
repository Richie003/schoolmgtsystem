"""Tenancy primitives.

Every tenant-owned model in this project subclasses :class:`TenantModel`, which
guarantees a non-null ``school`` FK and an indexed lookup path. Query scoping is
applied by :class:`core.viewsets.TenantModelViewSet` at the API boundary and by
``Model.objects.for_school(...)`` everywhere else.
"""

from django.core.validators import RegexValidator
from django.db import models
from django.utils.text import slugify

hex_colour_validator = RegexValidator(
    regex=r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$',
    message='Enter a hex colour such as #2563eb.',
)


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class School(TimeStampedModel):
    """A tenant. The root of every ownership chain in the system."""

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=120, unique=True)
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text='Short unique identifier used as a prefix for admission numbers.',
    )
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    logo = models.ImageField(upload_to='school-logos/', blank=True, null=True)

    # Branding. The whole palette is derived from this one colour on the client,
    # so an admin cannot produce an unreadable combination — only a different
    # hue. Shades and the contrasting text colour are computed, not configured.
    brand_color = models.CharField(
        max_length=7,
        default='#2563eb',
        validators=[hex_colour_validator],
        help_text='Primary brand colour, applied across every account in this school.',
    )
    display_name = models.CharField(
        max_length=120,
        blank=True,
        help_text='Optional short name shown in the sidebar instead of the full name.',
    )

    is_active = models.BooleanField(
        default=True,
        help_text='Deactivating a school immediately blocks all of its users from the API.',
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:120]
        if self.code:
            self.code = self.code.upper()
        super().save(*args, **kwargs)


class TenantQuerySet(models.QuerySet):
    def for_school(self, school):
        """Scope to one school.

        ``school`` may be a School instance, a pk, or None. None yields an empty
        queryset rather than everything — failing closed is the whole point.
        """
        if school is None:
            return self.none()
        return self.filter(school=school)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    """Default manager for tenant-owned models."""


class TenantModel(TimeStampedModel):
    """Abstract base for anything owned by exactly one school."""

    school = models.ForeignKey(
        School,
        on_delete=models.CASCADE,
        related_name='%(class)ss',
        db_index=True,
    )

    objects = TenantManager()

    class Meta:
        abstract = True
